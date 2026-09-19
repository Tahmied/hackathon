import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'node:path';
import { corsOrigins, env } from './config/env.js';
import allRoutes from './routes/routes.js';
import { errorHandler } from './shared/middleware/errorHandler.js';
import './shared/middleware/types.js';

export function createApp() {
  const app = express();

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(
    cors({
      origin: corsOrigins,
      credentials: true,
    }),
  );
  app.use(
    rateLimit({
      windowMs: 60 * 1000,
      limit: 600,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { success: false, message: 'Too many requests' },
    }),
  );
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());

  // Uploaded receipts / KYC documents
  app.use(
    `/${env.UPLOAD_DIR}`,
    express.static(path.resolve(process.cwd(), env.UPLOAD_DIR), {
      maxAge: '1d',
    }),
  );

  app.use('/api/v1', allRoutes);

  app.use((_req, res) => {
    res.status(404).json({ success: false, message: 'Route not found', data: null });
  });

  app.use(errorHandler);

  return app;
}
