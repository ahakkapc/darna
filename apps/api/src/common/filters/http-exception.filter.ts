import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: unknown = undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, any>;
        if (b.error?.code) {
          code = b.error.code;
          message = b.error.message ?? message;
          details = b.error.details;
        } else {
          code = b.error ?? code;
          message = b.message ?? message;
        }
      } else if (typeof body === 'string') {
        message = body;
      }
    }

    res.setHeader('x-request-id', requestId);
    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
      requestId,
    });
  }
}
