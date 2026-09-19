import type { ErrorRequestHandler, RequestHandler } from 'express';
import mongoose from 'mongoose';
import { ZodError } from 'zod';
import { ApiError } from '../utils/ApiError.js';
import { logger } from '../utils/logger.js';
import { isDev } from '../../config/env.js';

export const notFound: RequestHandler = (req, _res, next) => {
  next(new ApiError(404, `Route not found: ${req.method} ${req.originalUrl}`));
};

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let error = err;

  if (error instanceof mongoose.Error.ValidationError) {
    error = new ApiError(422, Object.values(error.errors).map((e) => e.message).join('; '));
  } else if (error instanceof mongoose.Error.CastError) {
    error = new ApiError(400, `Invalid value for ${error.path}`);
  } else if (typeof (error as { code?: number }).code === 'number' && (error as { code: number }).code === 11000) {
    const fields = Object.keys((error as { keyValue?: Record<string, unknown> }).keyValue ?? {});
    error = new ApiError(409, `Duplicate value for: ${fields.join(', ')}`);
  } else if (error instanceof ZodError) {
    error = new ApiError(422, error.issues.map((i) => i.message).join('; '));
  } else if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
    error = new ApiError(401, 'Invalid or expired token');
  }

  if (!(error instanceof ApiError)) {
    logger.error({ err: error, url: req.originalUrl }, 'unhandled error');
    error = new ApiError(500, isDev ? String(error?.message ?? 'Internal server error') : 'Internal server error');
  }

  res.status((error as ApiError).statusCode).json({
    success: false,
    message: (error as ApiError).message,
    code: (error as ApiError).code,
    errors: (error as ApiError).errors,
    data: null,
  });
};

import jwt from 'jsonwebtoken';
