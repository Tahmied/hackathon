import { Router } from 'express';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { send } from '../../shared/utils/ApiResponse.js';
import { authenticate } from '../../shared/middleware/auth.js';
import { uploadSingle, fileUrl } from '../../shared/middleware/upload.js';
import { runOcr, extractReceiptData, OCR_LOW_CONFIDENCE_THRESHOLD } from '../../shared/utils/ocr.service.js';

const router = Router();

router.use(authenticate);

/** Upload an image, return its URL + instant OCR preview (best-effort). */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    await new Promise<void>((resolve, reject) => {
      uploadSingle(req as never, res as never, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    const file = (req as unknown as { file?: Express.Multer.File }).file;
    if (!file) {
      return send(res, 400, null as never, 'Image file is required (field name: "file")');
    }
    const url = fileUrl(file.filename);
    let ocr: {
      available: boolean;
      confidence?: number;
      unclear?: boolean;
      extracted?: ReturnType<typeof extractReceiptData>;
    } = { available: false };
    try {
      const { text, confidence } = await runOcr(url);
      ocr = {
        available: true,
        confidence,
        unclear: confidence < OCR_LOW_CONFIDENCE_THRESHOLD,
        extracted: extractReceiptData(text),
      };
    } catch {
      // preview OCR failed — the record pipeline will retry server-side
    }
    send(res, 201, { url, ocr }, 'Uploaded');
  }),
);

export default router;
