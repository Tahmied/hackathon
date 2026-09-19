import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { ZodError, type ZodType } from 'zod';
import { ApiError } from '../utils/ApiError.js';

interface Schemas {
  body?: ZodType;
  params?: ZodType;
  query?: ZodType;
}

/**
 * Zod validation middleware. Parsed results are stored on
 * req.validatedBody / req.validatedParams / req.validatedQuery
 * (Express 5 makes req.query read-only, so we never reassign it).
 */
export const validate =
  (schemas: Schemas): RequestHandler =>
  (req: Request, res: Response, next: NextFunction) => {
    try {
      if (schemas.body) req.validatedBody = schemas.body.parse(req.body ?? {}) as Record<string, unknown>;
      if (schemas.params) req.validatedParams = schemas.params.parse(req.params ?? {}) as Record<string, unknown>;
      if (schemas.query) req.validatedQuery = schemas.query.parse(req.query ?? {}) as Record<string, unknown>;
      next();
    } catch (err) {
      if (err instanceof ZodError) {
        next(
          new ApiError(
            422,
            err.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
            err.issues,
          ),
        );
      } else {
        next(err);
      }
    }
  };
