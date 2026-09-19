import { Response } from 'express';

export class ApiResponse<T> {
  statusCode: number;
  data: T;
  message: string;
  success: boolean;

  constructor(statusCode: number, data: T, message = 'Success') {
    this.statusCode = statusCode;
    this.data = data;
    this.message = message;
    this.success = statusCode < 400;
  }
}

export function send<T>(res: Response, statusCode: number, data: T, message = 'Success') {
  return res.status(statusCode).json(new ApiResponse(statusCode, data, message));
}
