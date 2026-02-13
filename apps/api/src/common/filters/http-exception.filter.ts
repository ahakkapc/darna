import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AppError } from '../errors/app-error';

const IS_PROD = process.env.NODE_ENV === 'production';

interface PrismaKnownError {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(err: unknown): err is PrismaKnownError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as any).code === 'string' &&
    (err as any).code.startsWith('P')
  );
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId: string = (req as any).requestId ?? '';

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error';
    let details: Record<string, unknown> | undefined;

    // ── AppError ──────────────────────────────────────────────
    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;

    // ── HttpException (Nest built-in + our { error: {code,message} } pattern) ─
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();

      if (typeof body === 'object' && body !== null) {
        const b = body as Record<string, any>;
        if (b.error?.code) {
          code = b.error.code;
          message = b.error.message ?? message;
          details = b.error.details;
        } else if (b.code) {
          code = b.code;
          message = b.message ?? message;
          details = b.details;
        } else {
          code = this.statusToCode(status);
          message = b.message ?? message;
        }
      } else if (typeof body === 'string') {
        code = this.statusToCode(status);
        message = body;
      }

    // ── Prisma errors ─────────────────────────────────────────
    } else if (isPrismaKnownError(exception)) {
      const mapped = this.mapPrismaError(exception);
      status = mapped.status;
      code = mapped.code;
      message = mapped.message;
      details = mapped.details;

    // ── Unknown / unexpected ──────────────────────────────────
    } else {
      if (!IS_PROD && exception instanceof Error) {
        details = { stack: exception.stack };
      }
    }

    // Log
    if (status >= 500) {
      this.logger.error(
        `[${requestId}] ${status} ${code}: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else if (status >= 400) {
      this.logger.warn(`[${requestId}] ${status} ${code}: ${message}`);
    }

    res.status(status).json({
      error: { code, message, ...(details ? { details } : {}) },
      requestId,
    });
  }

  private mapPrismaError(err: PrismaKnownError): {
    status: number;
    code: string;
    message: string;
    details?: Record<string, unknown>;
  } {
    switch (err.code) {
      case 'P2002':
        return {
          status: 409,
          code: 'CONFLICT',
          message: 'Unique constraint violation',
          details: { target: err.meta?.target },
        };
      case 'P2003':
        return {
          status: 409,
          code: 'FK_CONFLICT',
          message: 'Foreign key constraint violation',
          details: { field: err.meta?.field_name },
        };
      case 'P2025':
        return {
          status: 404,
          code: 'NOT_FOUND',
          message: 'Record not found',
        };
      default:
        return {
          status: 500,
          code: 'DB_ERROR',
          message: 'Database error',
        };
    }
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400: return 'BAD_REQUEST';
      case 401: return 'UNAUTHENTICATED';
      case 403: return 'FORBIDDEN';
      case 404: return 'NOT_FOUND';
      case 409: return 'CONFLICT';
      case 410: return 'GONE';
      case 422: return 'UNPROCESSABLE_ENTITY';
      default:  return 'INTERNAL_ERROR';
    }
  }
}
