import { ApiError } from './ApiError.js';
import { Transaction } from '../../modules/transactions/transaction.model.js';
import { KycSubmission } from '../../modules/kyc/kyc.model.js';
import { runOcr, extractReceiptData, OCR_LOW_CONFIDENCE_THRESHOLD } from './ocr.service.js';
import { logger } from './logger.js';
import { toBdt } from './money.js';

/**
 * Challenge Case 2 / AI Level 2 pipeline (runs at upload time):
 * 1. tesseract.js extracts raw text + confidence
 * 2. regex logic extracts amount/reference/payer
 * 3. everything is cached on the MongoDB doc — admin review is instant
 * 4. AI (LLM reasoning over the structured data) runs afterwards, separately
 */

export async function processDepositReceipt(txId: string): Promise<void> {
  const tx = await Transaction.findById(txId);
  if (!tx?.receiptUrl) return;
  try {
    const { text, confidence } = await runOcr(tx.receiptUrl);
    const extracted = extractReceiptData(text);
    tx.ocrText = text;
    tx.ocrConfidence = confidence;
    tx.ocrUnclear = confidence < OCR_LOW_CONFIDENCE_THRESHOLD;
    tx.extractedData = {
      amount: extracted.amountPaisa,
      reference: extracted.reference,
      payer: extracted.payer,
      date: extracted.date,
      rawConfidence: confidence,
    };
    await tx.save();
    logger.info({ txId, confidence }, 'receipt OCR complete');

    // Fire-and-forget LLM reasoning over the extracted data
    try {
      const { analyzeDepositReceipt } = await import('../../modules/ai/ai.service.js');
      await analyzeDepositReceipt(txId);
    } catch {
      // AI unavailable — admin sees the manual-review state
    }
  } catch (err) {
    logger.warn({ err, txId }, 'receipt OCR failed');
    await Transaction.updateOne(
      { _id: txId },
      { $set: { ocrUnclear: true, 'aiAnalysis.available': false, 'aiAnalysis.reason': 'OCR failed' } },
    );
  }
}

export async function processKycDocument(kycId: string): Promise<void> {
  const kyc = await KycSubmission.findById(kycId);
  if (!kyc?.frontUrl) return;
  try {
    const { text, confidence } = await runOcr(kyc.frontUrl);
    kyc.ocrText = text;
    kyc.ocrConfidence = confidence;
    kyc.ocrUnclear = confidence < OCR_LOW_CONFIDENCE_THRESHOLD;

    // Heuristic: longest ALL-CAPS-ish token sequence on the first lines = name
    const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
    const nameLine = lines.find((l) => /^[A-Za-z][A-Za-z .'-]{4,40}$/.test(l));
    kyc.extractedName = nameLine ?? null;
    await kyc.save();

    try {
      const { analyzeKycDocument } = await import('../../modules/ai/ai.service.js');
      await analyzeKycDocument(kycId);
    } catch {
      /* AI optional */
    }
  } catch (err) {
    logger.warn({ err, kycId }, 'KYC OCR failed');
    await KycSubmission.updateOne(
      { _id: kycId },
      { $set: { ocrUnclear: true, 'aiAnalysis.available': false, 'aiAnalysis.reason': 'OCR failed' } },
    );
  }
}

/** Server-side comparison used for the red badges (no LLM needed). */
export function compareReceiptWithClaimed(
  claimedAmountPaisa: number,
  claimedReference: string,
  extracted: { amount?: number | null; reference?: string | null },
) {
  const issues: string[] = [];
  if (extracted.amount != null && extracted.amount !== claimedAmountPaisa) {
    issues.push(
      `CRITICAL MISMATCH: User claimed ৳${toBdt(claimedAmountPaisa).toFixed(2)}, OCR extracted ৳${toBdt(extracted.amount).toFixed(2)}.`,
    );
  }
  if (extracted.reference && claimedReference &&
      extracted.reference.toUpperCase() !== claimedReference.trim().toUpperCase()) {
    issues.push(
      `REFERENCE MISMATCH: claimed ${claimedReference}, OCR extracted ${extracted.reference}.`,
    );
  }
  return {
    amountMatch: extracted.amount == null ? null : extracted.amount === claimedAmountPaisa,
    referenceMatch:
      extracted.reference == null ? null : extracted.reference.toUpperCase() === claimedReference.trim().toUpperCase(),
    issues,
  };
}

export function assertUploadResult(file?: Express.Multer.File): Express.Multer.File {
  if (!file) throw ApiError.badRequest('Image file is required (field name: "file")');
  return file;
}
