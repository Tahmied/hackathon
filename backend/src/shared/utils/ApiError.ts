export class ApiError extends Error {
  statusCode: number;
  data: unknown;
  success: false;
  errors: unknown[];
  code?: string;

  constructor(
    statusCode: number,
    message = 'Something went wrong',
    errors: unknown[] = [],
    code?: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.data = null;
    this.success = false;
    this.errors = errors;
    this.code = code;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = 'Bad request', code?: string) {
    return new ApiError(400, message, [], code);
  }
  static unauthorized(message = 'Unauthorized', code?: string) {
    return new ApiError(401, message, [], code);
  }
  static forbidden(message = 'Forbidden', code?: string) {
    return new ApiError(403, message, [], code);
  }
  static notFound(message = 'Not found', code?: string) {
    return new ApiError(404, message, [], code);
  }
  static conflict(message = 'Conflict', code?: string) {
    return new ApiError(409, message, [], code);
  }
  static unprocessable(message = 'Unprocessable entity', code?: string) {
    return new ApiError(422, message, [], code);
  }
  static tooMany(message = 'Too many requests', code?: string) {
    return new ApiError(429, message, [], code);
  }
  static internal(message = 'Internal server error', code?: string) {
    return new ApiError(500, message, [], code);
  }
  static serviceUnavailable(message = 'Service temporarily unavailable', code?: string) {
    return new ApiError(503, message, [], code);
  }
}
