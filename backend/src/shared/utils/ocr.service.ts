import path from 'node:path';
import fs from 'node:fs';
import { createWorker } from 'tesseract.js';
import { env } from '../../config/env.js';
import { logger } from '../utils/logger.js';

export interface OcrResult {
  text: string;
  confidence: number;
}

let workerPromise: Promise<Awaited<ReturnType<typeof createWorker>>> | null = null;

async function getWorker() {
  if (!workerPromise) {
    workerPromise = createWorker('eng', 1, {
      cachePath: path.resolve(process.cwd(), '.tesseract-cache'),
      logger: () => undefined,
    }).catch((err) => {
      workerPromise = null;
      throw err;
    });
  }
  return workerPromise;
}

/** OCR an image buffer with tesseract.js (runs locally — no vision API). */
export async function runOcr(imagePath: string): Promise<OcrResult> {
  const absolute = path.resolve(process.cwd(), imagePath.replace(/^\//, ''));
  if (!fs.existsSync(absolute)) throw new Error(`Image not found: ${absolute}`);
  const worker = await getWorker();
  const { data } = await worker.recognize(absolute);
  return { text: data.text ?? '', confidence: data.confidence ?? 0 };
}

export interface ExtractedReceipt {
  amountPaisa: number | null;
  reference: string | null;
  payer: string | null;
  date: string | null;
}

const AMOUNT_PATTERNS = [
  /(?:amount|total|paid|sent|deposit)\s*[:=\-]?\s*(?:bdt|tk|৳|taka)?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  /(?:bdt|tk|৳)\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i,
  /([0-9]{2,7}(?:\.[0-9]{2})?)\s*(?:bdt|tk|taka|৳)/i,
];

const REFERENCE_PATTERNS = [
  /(?:trx[\s-]?id|transaction[\s-]?id|txn[\s-]?id|trans[\s-]?id)\s*[:=\-#]?\s*([A-Z0-9][A-Z0-9\-]{5,24})/i,
  /(?:ref(?:erence)?(?:[\s-]?no|[\s-]?id|[\s-]#)?)\s*[:=\-#]?\s*([A-Z0-9][A-Z0-9\-]{4,24})/i,
];

const DATE_PATTERN =
  /(\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}(?:\s+\d{1,2}:\d{2}(?::\d{2})?)?)/;

export function extractReceiptData(text: string): ExtractedReceipt {
  const cleaned = text.replace(/\s+/g, ' ');
  let amountPaisa: number | null = null;
  for (const rx of AMOUNT_PATTERNS) {
    const m = cleaned.match(rx);
    if (m?.[1]) {
      const n = Number(m[1].replace(/,/g, ''));
      if (Number.isFinite(n) && n > 0) {
        amountPaisa = Math.round(n * 100);
        break;
      }
    }
  }

  let reference: string | null = null;
  for (const rx of REFERENCE_PATTERNS) {
    const m = cleaned.match(rx);
    if (m?.[1]) {
      reference = m[1].toUpperCase();
      break;
    }
  }

  const payerMatch = cleaned.match(/(?:from|sender|name)\s*[:=\-]\s*([A-Za-z .'-]{3,40})/i);

  const dateMatch = cleaned.match(DATE_PATTERN);

  return {
    amountPaisa,
    reference,
    payer: payerMatch?.[1]?.trim() ?? null,
    date: dateMatch?.[1] ?? null,
  };
}

export const OCR_LOW_CONFIDENCE_THRESHOLD = 60;

export async function ocrAvailable(): Promise<boolean> {
  try {
    await getWorker();
    return true;
  } catch (err) {
    logger.error({ err }, 'OCR worker failed to initialise');
    return false;
  }
}
