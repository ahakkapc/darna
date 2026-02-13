import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { AppError } from '../errors/app-error';

export const RATE_LIMIT_KEY = 'rateLimit';

export interface RateLimitPolicy {
  max: number;
  windowSeconds: number;
  keyFn?: (req: Request) => string;
}

export function RateLimit(policy: RateLimitPolicy) {
  return (target: any, key?: string, descriptor?: any) => {
    const metadataTarget = descriptor ? descriptor.value : target;
    Reflect.defineMetadata(RATE_LIMIT_KEY, policy, metadataTarget);
    return descriptor ?? target;
  };
}

interface BucketEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, BucketEntry>();

const CLEANUP_INTERVAL = 60_000;
let lastCleanup = Date.now();

function cleanup() {
  const now = Date.now();
  if (now - lastCleanup < CLEANUP_INTERVAL) return;
  lastCleanup = now;
  for (const [key, entry] of store) {
    if (entry.resetAt < now) store.delete(key);
  }
}

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly logger = new Logger('RateLimit');

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const policy = this.reflector.getAllAndOverride<RateLimitPolicy | undefined>(
      RATE_LIMIT_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!policy) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse();
    const key = policy.keyFn ? policy.keyFn(req) : this.defaultKey(req, policy);

    cleanup();

    const now = Date.now();
    let bucket = store.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + policy.windowSeconds * 1000 };
      store.set(key, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, policy.max - bucket.count);
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(policy.max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));
    res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

    if (bucket.count > policy.max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      this.logger.warn(
        `SECURITY_RATE_LIMIT_HIT: key=${key} count=${bucket.count} max=${policy.max}`,
      );
      throw new AppError('RATE_LIMITED', 429, 'Too many requests. Please retry later.', {
        retryAfterSeconds,
      });
    }

    return true;
  }

  private defaultKey(req: Request, policy: RateLimitPolicy): string {
    const userId = (req as any).user?.userId;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';
    const path = req.route?.path ?? req.originalUrl;
    return userId
      ? `rl:user:${userId}:${path}:${policy.windowSeconds}`
      : `rl:ip:${ip}:${path}:${policy.windowSeconds}`;
  }
}

const globalStore = new Map<string, BucketEntry>();

@Injectable()
export class GlobalRateLimitGuard implements CanActivate {
  private readonly logger = new Logger('GlobalRateLimit');

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    const res = context.switchToHttp().getResponse();

    const userId = (req as any).user?.userId;
    const ip = req.ip || req.socket?.remoteAddress || 'unknown';

    const key = userId ? `grl:user:${userId}` : `grl:ip:${ip}`;
    const max = userId ? 300 : 500;
    const windowMs = 5 * 60 * 1000;

    const now = Date.now();
    let bucket = globalStore.get(key);
    if (!bucket || bucket.resetAt < now) {
      bucket = { count: 0, resetAt: now + windowMs };
      globalStore.set(key, bucket);
    }

    bucket.count++;

    const remaining = Math.max(0, max - bucket.count);
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(remaining));

    if (bucket.count > max) {
      res.setHeader('Retry-After', String(retryAfterSeconds));
      this.logger.warn(`SECURITY_GLOBAL_RATE_LIMIT_HIT: key=${key}`);
      throw new AppError('RATE_LIMITED', 429, 'Too many requests. Please retry later.', {
        retryAfterSeconds,
      });
    }

    return true;
  }
}
