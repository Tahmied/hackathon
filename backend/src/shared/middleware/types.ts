import type { AuthUser } from '../utils/permissionHelpers.js';

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser;
    validatedBody?: Record<string, unknown>;
    validatedParams?: Record<string, unknown>;
    validatedQuery?: Record<string, unknown>;
  }
}

declare module 'express' {
  interface Request {
    user?: AuthUser;
    validatedBody?: Record<string, unknown>;
    validatedParams?: Record<string, unknown>;
    validatedQuery?: Record<string, unknown>;
  }
}

export {};
