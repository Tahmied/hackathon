import { env } from '../../config/env.js';
import { logger } from '../../shared/utils/logger.js';

export interface ChatMessageInput {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionResult {
  ok: boolean;
  content?: string;
  error?: string;
  model?: string;
}

/** Free-model fallback chain (OpenRouter). First that responds wins. */
const MODEL_FALLBACKS = [
  env.OPENROUTER_MODEL,
  'z-ai/glm-5.2:free',
  'google/gemma-4-31b-it:free',
  'nvidia/nemotron-3-super-120b-a12b:free',
  'qwen/qwen3.8-27b:free',
].filter((m, i, arr) => m && arr.indexOf(m) === i);

let lastErrorAt = 0;
let lastErrorMessage = '';

export function aiHealth() {
  return {
    configured: Boolean(env.OPENROUTER_API_KEY),
    model: env.OPENROUTER_MODEL,
    lastErrorAt: lastErrorAt ? new Date(lastErrorAt).toISOString() : null,
    lastErrorMessage: lastErrorMessage || null,
    simulatedOutage: simulatedOutage,
  };
}

let simulatedOutage = false;
export function setSimulatedOutage(value: boolean) {
  simulatedOutage = value;
}

/*
 * Free-tier rate limits are generous in tokens but strict in requests/min.
 * We space requests out globally and honour `retry-after` on 429s.
 */
const MIN_REQUEST_INTERVAL_MS = 1500;
const MAX_429_WAIT_MS = 25000;
let lastCallAt = 0;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function acquireSlot(): Promise<void> {
  const gap = Date.now() - lastCallAt;
  if (gap < MIN_REQUEST_INTERVAL_MS) {
    await sleep(MIN_REQUEST_INTERVAL_MS - gap);
  }
  lastCallAt = Date.now();
}

export async function chatCompletion(
  messages: ChatMessageInput[],
  opts: { maxTokens?: number; temperature?: number } = {},
): Promise<CompletionResult> {
  if (!env.OPENROUTER_API_KEY) {
    return { ok: false, error: 'AI not configured' };
  }
  if (simulatedOutage) {
    return { ok: false, error: 'AI service simulated outage (devtools)' };
  }

  for (const model of MODEL_FALLBACKS) {
    // one retry on 429 honouring retry-after, then move to the next model
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        await acquireSlot();
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), env.AI_TIMEOUT_MS);
        const res = await fetch(`${env.OPENROUTER_BASE_URL}/chat/completions`, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
            'content-type': 'application/json',
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'NovaTrade',
          },
          body: JSON.stringify({
            model,
            messages,
            max_tokens: opts.maxTokens ?? 700,
            temperature: opts.temperature ?? 0.2,
          }),
        }).finally(() => clearTimeout(timeout));

        if (res.status === 429) {
          const retryAfterHeader = Number(res.headers.get('retry-after') ?? 0);
          const waitMs = Math.min(
            Number.isFinite(retryAfterHeader) && retryAfterHeader > 0
              ? retryAfterHeader * 1000
              : 4000 * (attempt + 1),
            MAX_429_WAIT_MS,
          );
          logger.warn({ model, waitMs }, 'openrouter rate limited — backing off');
          await sleep(waitMs);
          continue; // retry same model
        }

        if (!res.ok) {
          const body = await res.text();
          lastErrorAt = Date.now();
          lastErrorMessage = `${res.status}: ${body.slice(0, 200)}`;
          logger.warn({ model, status: res.status }, 'openrouter non-OK response');
          break; // try next model
        }

        const json = (await res.json()) as {
          choices?: { message?: { content?: string } }[];
        };
        const content = json.choices?.[0]?.message?.content;
        if (content && content.trim()) {
          return { ok: true, content, model };
        }
        lastErrorAt = Date.now();
        lastErrorMessage = 'empty completion';
        break; // try next model
      } catch (err) {
        lastErrorAt = Date.now();
        lastErrorMessage = err instanceof Error ? err.message : String(err);
        logger.warn({ err, model }, 'openrouter request failed');
        break; // try next model
      }
    }
  }
  return { ok: false, error: lastErrorMessage || 'AI provider unavailable' };
}

/**
 * Tolerant JSON parser for the tool protocol — free models often wrap JSON
 * in markdown fences or prepend text, so we brace-match the first object.
 */
export function parseAssistantJson(raw: string): Record<string, unknown> | null {
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidates = [fenced?.[1], raw].filter(Boolean) as string[];
  for (const candidate of candidates) {
    const start = candidate.indexOf('{');
    if (start === -1) continue;
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < candidate.length; i++) {
      const ch = candidate[i]!;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = !inString;
      if (inString) continue;
      if (ch === '{') depth++;
      if (ch === '}') {
        depth--;
        if (depth === 0) {
          const slice = candidate.slice(start, i + 1);
          try {
            return JSON.parse(slice) as Record<string, unknown>;
          } catch {
            break;
          }
        }
      }
    }
  }
  return null;
}
