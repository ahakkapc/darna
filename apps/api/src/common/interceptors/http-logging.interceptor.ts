import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

@Injectable()
export class HttpLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HTTP');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse<Response>();
    const start = Date.now();
    const requestId: string = (req as any).requestId ?? '';
    const userId: string | undefined = (req as any).user?.userId;
    const orgId: string | undefined = (req as any).orgId;

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = Date.now() - start;
          const status = res.statusCode;
          const log = {
            requestId,
            method: req.method,
            path: req.originalUrl,
            status,
            durationMs: duration,
            ...(userId ? { userId } : {}),
            ...(orgId ? { orgId } : {}),
          };

          if (status >= 500) {
            this.logger.error(JSON.stringify(log));
          } else if (status >= 400) {
            this.logger.warn(JSON.stringify(log));
          } else {
            this.logger.log(JSON.stringify(log));
          }
        },
        error: () => {
          const duration = Date.now() - start;
          const log = {
            requestId,
            method: req.method,
            path: req.originalUrl,
            status: res.statusCode,
            durationMs: duration,
            ...(userId ? { userId } : {}),
            ...(orgId ? { orgId } : {}),
          };
          this.logger.error(JSON.stringify(log));
        },
      }),
    );
  }
}
