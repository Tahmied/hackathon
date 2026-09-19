import { Types } from 'mongoose';
import { ApiError } from '../../shared/utils/ApiError.js';
import { chatCompletion, parseAssistantJson, aiHealth, setSimulatedOutage, type ChatMessageInput } from './openrouter.provider.js';
import { toolsFor, renderToolDocs, type Tool } from './tools.js';
import type { AuthUser } from '../../shared/utils/permissionHelpers.js';
import { ChatMessage, Conversation, type ToolTraceStep } from '../chat/chat.model.js';
import { Transaction } from '../transactions/transaction.model.js';
import { KycSubmission } from '../kyc/kyc.model.js';
import { Ticket } from '../tickets/ticket.model.js';
import { compareReceiptWithClaimed } from '../../shared/utils/receiptPipeline.js';
import { toBdt } from '../../shared/utils/money.js';
import { SocketEvents } from '../../constants/index.js';
import { ChatSenderTypes } from '../../constants/index.js';
import { getIO } from '../../sockets/io.js';
import { logger } from '../../shared/utils/logger.js';

const MAX_TOOL_ITERATIONS = 4;

const TOOL_PROTOCOL_PROMPT = `
You are Nova AI, the assistant inside NovaTrade, a BDT margin-trading platform for crypto, gold and forex.
Answer using the provided tools when you need data. Be concise, factual and friendly. Use BDT (৳) amounts.

TOOL CALL PROTOCOL — you MUST reply with exactly ONE JSON object and nothing else:
- To call a tool: {"thought": "<short reasoning>", "tool": {"name": "<toolName>", "arguments": {…}}}
- To answer the user: {"thought": "<short reasoning>", "answer": "<final answer for the user>"}

Available tools:
${'{TOOLS}'}

Rules:
- Output RAW JSON only. Never wrap it in any other syntax, never emit function-call or tool-call tags/markers (e.g. <dots_function_call>, <tool_call>) — those are forbidden. Never use markdown code fences.
- Only use tools from the list. Never invent data you have not retrieved.
- After you receive a TOOL_RESULT message, either call another tool or give the final answer.
- Maximum ${MAX_TOOL_ITERATIONS} tool calls.`;

/**
 * Free chat models sometimes leak their internal special tokens (e.g.
 * <dots_function_call>) as literal text — strip that noise before parsing
 * or displaying anything.
 */
export function sanitizeModelText(raw: string): string {
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .replace(/<\/?[a-z0-9_-]*(function_call|tool_call|function_calls)[a-z0-9_=-]*>/gi, '')
    .replace(/<\|[a-z0-9_]+\|>/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function buildSystemPrompt(tools: Tool[], extraContext?: string): string {
  let prompt = TOOL_PROTOCOL_PROMPT.replace('{TOOLS}', renderToolDocs(tools) || '(no tools available)');
  if (extraContext) prompt += `\n\nCONTEXT (already known — do not re-fetch):\n${extraContext}`;
  return prompt;
}

export interface ToolLoopResult {
  available: boolean;
  reason?: string;
  answer: string;
  trace: ToolTraceStep[];
}

export async function runToolLoop(
  caller: AuthUser,
  userMessage: string,
  opts: { staff: boolean; context?: string; history?: ChatMessageInput[] },
): Promise<ToolLoopResult> {
  const tools = toolsFor(caller, opts.staff);
  const trace: ToolTraceStep[] = [];
  const collectedSummaries: string[] = [];

  const messages: ChatMessageInput[] = [
    { role: 'system', content: buildSystemPrompt(tools, opts.context) },
    ...(opts.history ?? []),
    { role: 'user', content: userMessage },
  ];

  const composeFallbackAnswer = () => {
    if (collectedSummaries.length === 0) {
      return 'I could not complete the analysis right now. Please rephrase, or contact human support.';
    }
    return `Here is what I found:\n${collectedSummaries.map((s) => `• ${s}`).join('\n')}`;
  };

  for (let iteration = 0; iteration <= MAX_TOOL_ITERATIONS; iteration++) {
    const completion = await chatCompletion(messages);
    if (!completion.ok || !completion.content) {
      return {
        available: false,
        reason: completion.error ?? 'AI unavailable',
        answer:
          collectedSummaries.length > 0
            ? composeFallbackAnswer()
            : 'AI Assistant is currently offline. Please contact human support.',
        trace,
      };
    }

    const rawContent = sanitizeModelText(completion.content);
    const parsed = parseAssistantJson(rawContent);
    if (!parsed) {
      // Model may have "wanted" to call a tool but emitted tag-noise instead of
      // our JSON protocol — nudge it once toward the required format.
      const looksLikeToolIntent =
        /function_call|tool_call|getMy[A-Z]|getUser|searchUsers|getPending|getMarket|detectUser|getAudit|explainReserved|getTicket|getAsset/i.test(
          rawContent,
        );
      if (looksLikeToolIntent && iteration < MAX_TOOL_ITERATIONS) {
        trace.push({ thought: rawContent.slice(0, 120) });
        messages.push({ role: 'assistant', content: completion.content });
        messages.push({
          role: 'user',
          content:
            'FORMAT REMINDER: reply with ONLY one raw JSON object and nothing else — {"thought":"…","tool":{"name":"<toolName>","arguments":{…}}} to call a tool, or {"thought":"…","answer":"…"} to answer the user. Do not output any tags like <dots_function_call>.',
        });
        continue;
      }
      const prose = rawContent.trim();
      if (prose) return { available: true, answer: prose, trace };
      return { available: true, answer: composeFallbackAnswer(), trace };
    }

    const thought = typeof parsed.thought === 'string' ? parsed.thought : '';
    const answerRaw = typeof parsed.answer === 'string' ? sanitizeModelText(parsed.answer) : null;
    const toolObj = parsed.tool as { name?: string; arguments?: Record<string, unknown> } | undefined;

    if (answerRaw || !toolObj?.name) {
      trace.push({ thought: sanitizeModelText(thought) });
      return {
        available: true,
        answer: answerRaw || composeFallbackAnswer(),
        trace,
      };
    }

    const tool = tools.find((t) => t.name === toolObj.name);
    if (!tool) {
      trace.push({ thought, tool: toolObj.name, args: toolObj.arguments, resultSummary: 'unknown tool' });
      messages.push({ role: 'assistant', content: completion.content });
      messages.push({ role: 'user', content: `TOOL_RESULT: Unknown tool "${toolObj.name}". Available: ${tools.map((t) => t.name).join(', ')}` });
      continue;
    }

    try {
      const { result, summary } = await tool.execute(toolObj.arguments ?? {}, { caller });
      collectedSummaries.push(`${tool.name}: ${summary}`);
      trace.push({ thought, tool: tool.name, args: toolObj.arguments, resultSummary: summary });
      messages.push({ role: 'assistant', content: completion.content });
      messages.push({ role: 'user', content: `TOOL_RESULT for ${tool.name}:\n${JSON.stringify(result).slice(0, 6000)}` });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'tool failed';
      trace.push({ thought, tool: tool.name, args: toolObj.arguments, resultSummary: `error: ${msg}` });
      messages.push({ role: 'assistant', content: completion.content });
      messages.push({ role: 'user', content: `TOOL_ERROR for ${tool.name}: ${msg}` });
    }
  }

  return {
    available: true,
    answer: composeFallbackAnswer(),
    trace,
  };
}

/* ---------------- user assistant (chat widget, AI tab) ---------------- */

export async function generateAssistantReply(input: {
  conversationId: string;
  userId: string;
  userMessage: string;
}) {
  const { fetchUserWithPermissions } = await import('../../shared/utils/permissionHelpers.js');
  const caller = await fetchUserWithPermissions(input.userId);
  if (!caller) throw ApiError.unauthorized('User not found');

  const priorMessages = await ChatMessage.find({ conversationId: input.conversationId })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();
  const history: ChatMessageInput[] = priorMessages
    .reverse()
    .filter((m) => m.senderType !== ChatSenderTypes.SYSTEM)
    .map((m) => ({
      role: m.senderType === ChatSenderTypes.USER ? 'user' : 'assistant',
      content: m.body,
    }));

  const result = await runToolLoop(caller, input.userMessage, { staff: false, history });

  const message = await ChatMessage.create({
    conversationId: input.conversationId,
    senderType: ChatSenderTypes.AI,
    senderName: 'Nova AI',
    body: result.answer,
    toolTrace: result.trace,
    aiUnavailable: !result.available,
  });

  const conversation = await Conversation.findById(input.conversationId);
  if (conversation) {
    conversation.lastMessage = result.answer.slice(0, 140);
    conversation.lastMessageAt = new Date();
    conversation.lastMessageBy = ChatSenderTypes.AI;
    await conversation.save();
  }

  const io = getIO();
  const socketPayload = {
    id: message._id.toString(),
    conversationId: input.conversationId,
    senderType: 'AI' as const,
    senderName: 'Nova AI',
    body: message.body,
    toolTrace: message.toolTrace,
    aiUnavailable: message.aiUnavailable,
    createdAt: message.createdAt,
  };
  io?.to(`chat:${input.conversationId}`).emit(SocketEvents.CHAT_MESSAGE, socketPayload);
  // Fallback channel via the user's personal room (joined at socket connect)
  io?.to(`user:${input.userId}`).emit(SocketEvents.CHAT_MESSAGE, socketPayload);

  return message;
}

/* ---------------- deposit receipt AI analysis (LLM reasons over OCR data) ---------------- */

export async function analyzeDepositReceipt(txId: string, actor?: AuthUser) {
  const tx = await Transaction.findById(txId);
  if (!tx) throw ApiError.notFound('Transaction not found');

  const base = {
    analyzedAt: new Date(),
  };

  if (!tx.extractedData && !tx.ocrText) {
    tx.aiAnalysis = {
      ...base,
      available: false,
      reason: 'OCR data not available. Manual review required.',
      verdict: 'UNCLEAR',
    };
    await tx.save();
    return tx.aiAnalysis;
  }

  const comparison = compareReceiptWithClaimed(tx.amount, tx.reference, {
    amount: tx.extractedData?.amount,
    reference: tx.extractedData?.reference,
  });

  const completion = await chatCompletion([
    {
      role: 'system',
      content:
        'You are a payments-review assistant for the NovaTrade trading platform. Compare the user-claimed deposit data with the OCR-extracted payment receipt data. Reply with a strict JSON object: {"verdict": "MATCH"|"MISMATCH"|"UNCLEAR", "issues": ["…"], "summary": "1-2 sentences for the reviewer"}. Flag any discrepancy in amounts, references, payer names, or suspicious timing.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        claimed: {
          amountBdt: toBdt(tx.amount),
          reference: tx.reference,
          method: tx.method,
          accountNumber: tx.accountNumber,
          submittedAt: tx.createdAt,
        },
        ocrExtracted: {
          amountBdt: tx.extractedData?.amount != null ? toBdt(tx.extractedData.amount) : null,
          reference: tx.extractedData?.reference,
          payer: tx.extractedData?.payer,
          date: tx.extractedData?.date,
          ocrConfidence: tx.ocrConfidence,
          ocrTextSample: tx.ocrText?.slice(0, 800),
        },
        structuralComparison: comparison,
      }),
    },
  ]);

  if (!completion.ok) {
    tx.aiAnalysis = {
      ...base,
      available: false,
      reason: 'AI Service Unavailable. Manual review required.',
      verdict: comparison.issues.length ? 'MISMATCH' : 'UNCLEAR',
      issues: comparison.issues,
    };
    await tx.save();
    return tx.aiAnalysis;
  }

  const parsed = parseAssistantJson(completion.content ?? '');
  const verdict = (parsed?.verdict as string) ?? (comparison.issues.length ? 'MISMATCH' : 'UNCLEAR');
  tx.aiAnalysis = {
    ...base,
    available: true,
    verdict: (['MATCH', 'MISMATCH', 'UNCLEAR'].includes(verdict) ? verdict : 'UNCLEAR') as 'MATCH' | 'MISMATCH' | 'UNCLEAR',
    issues: [
      ...comparison.issues,
      ...((parsed?.issues as string[]) ?? []),
    ],
    summary: sanitizeModelText((parsed?.summary as string) ?? completion.content?.slice(0, 400) ?? ''),
  };
  await tx.save();
  return tx.aiAnalysis;
}

/* ---------------- KYC document AI analysis ---------------- */

export async function analyzeKycDocument(kycId: string) {
  const kyc = await KycSubmission.findById(kycId).populate('userId', 'name');
  if (!kyc) throw ApiError.notFound('KYC submission not found');
  const user = kyc.userId as unknown as { name?: string };
  const base = { analyzedAt: new Date() };

  if (!kyc.ocrText) {
    kyc.aiAnalysis = { ...base, available: false, reason: 'OCR data not available. Manual review required.', nameMatch: null };
    await kyc.save();
    return kyc.aiAnalysis;
  }

  const nameMatch =
    kyc.extractedName && user?.name
      ? normalized(kyc.extractedName).includes(normalized(user.name)) ||
        normalized(user.name).includes(normalized(kyc.extractedName))
      : null;

  const completion = await chatCompletion([
    {
      role: 'system',
      content:
        'You are a KYC review assistant. Compare the identity document OCR text against the profile name. Reply with strict JSON: {"nameMatch": true|false|null, "issues": ["…"], "summary": "1-2 sentences"}.',
    },
    {
      role: 'user',
      content: JSON.stringify({
        profileName: user?.name,
        extractedDocName: kyc.extractedName,
        docType: kyc.docType,
        declaredNameOnDoc: kyc.fullNameOnDoc,
        ocrConfidence: kyc.ocrConfidence,
        ocrTextSample: kyc.ocrText?.slice(0, 800),
        structuralNameMatch: nameMatch,
      }),
    },
  ]);

  if (!completion.ok) {
    kyc.aiAnalysis = {
      ...base,
      available: false,
      reason: 'AI Service Unavailable. Manual review required.',
      nameMatch,
    };
    await kyc.save();
    return kyc.aiAnalysis;
  }

  const parsed = parseAssistantJson(completion.content ?? '');
  kyc.aiAnalysis = {
    ...base,
    available: true,
    nameMatch: typeof parsed?.nameMatch === 'boolean' ? parsed.nameMatch : nameMatch,
    issues: (parsed?.issues as string[]) ?? [],
    summary: sanitizeModelText((parsed?.summary as string) ?? completion.content?.slice(0, 400) ?? ''),
  };
  await kyc.save();
  return kyc.aiAnalysis;
}

function normalized(value: string) {
  return value.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
}

/* ---------------- ticket summarizer ---------------- */

export async function summarizeTicket(ticketId: string) {
  const ticket = await Ticket.findById(ticketId);
  if (!ticket) throw ApiError.notFound('Ticket not found');

  const thread = ticket.messages
    .filter((m) => !m.isInternalNote)
    .map((m) => `${m.senderRole} (${m.senderName}): ${m.body}`)
    .join('\n');

  const completion = await chatCompletion([
    {
      role: 'system',
      content:
        'Summarize this support thread into 2-3 short bullet points for a support reviewer. Reply with strict JSON: {"bullets": ["…"], "sentiment": "calm"|"frustrated"|"angry"}.',
    },
    { role: 'user', content: `Subject: ${ticket.subject}\n\n${thread.slice(0, 6000)}` },
  ]);

  if (!completion.ok) {
    return { available: false, reason: 'AI Service Unavailable. Manual review required.', bullets: [], sentiment: null };
  }
  const parsed = parseAssistantJson(completion.content ?? '');
  return {
    available: true,
    bullets: ((parsed?.bullets as string[]) ?? []).map((b) => sanitizeModelText(String(b))),
    sentiment: (parsed?.sentiment as string) ?? null,
  };
}

/* ---------------- staff assistant ---------------- */

export async function staffAssistant(caller: AuthUser, message: string, targetUserId?: string) {
  let context: string | undefined;
  if (targetUserId && Types.ObjectId.isValid(targetUserId)) {
    const { getUserDetail } = await import('../users/users.service.js');
    try {
      const detail = await getUserDetail(targetUserId);
      context = `The user being discussed: ${JSON.stringify({
        id: targetUserId,
        name: detail.user.name,
        email: detail.user.email,
        kycStatus: detail.user.kycStatus,
      })}`;
    } catch {
      /* context optional */
    }
  }
  return runToolLoop(caller, message, { staff: true, context });
}

/* ---------------- health + devtools ---------------- */

export function getAiStatus() {
  return aiHealth();
}

export function setAiOutage(enabled: boolean) {
  setSimulatedOutage(enabled);
  logger.warn({ enabled }, 'AI simulated outage toggled');
}
