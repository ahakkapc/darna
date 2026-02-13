import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { Request, Response } from 'express';

function maskIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    return `${parts[0]}.${parts[1]}.*.*`;
  }
  return ip.substring(0, 10) + '***';
}

function truncateUa(ua: string | undefined): string | undefined {
  if (!ua) return undefined;
  return ua.length > 120 ? ua.substring(0, 120) + '…' : ua;
}

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
          this.emit(req, res, start, requestId, userId, orgId);
        },
        error: () => {
          this.emit(req, res, start, requestId, userId, orgId);
        },
      }),
    );
  }

  private emit(
    req: Request,
    res: Response,
    start: number,
    requestId: string,
    userId: string | undefined,
    orgId: string | undefined,
  ) {
    const duration = Date.now() - start;
    const status = res.statusCode;
    const log: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level: status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info',
      requestId,
      method: req.method,
      path: req.originalUrl,
      status,
      durationMs: duration,
    };
    if (userId) log.userId = userId;
    if (orgId) log.organizationId = orgId;
    log.ip = maskIp(req.ip || req.socket?.remoteAddress);
    log.userAgent = truncateUa(req.headers['user-agent']);

    if (status >= 500) {
      this.logger.error(JSON.stringify(log));
    } else if (status >= 400) {
      this.logger.warn(JSON.stringify(log));
    } else {
      this.logger.log(JSON.stringify(log));
    }
  }
}
