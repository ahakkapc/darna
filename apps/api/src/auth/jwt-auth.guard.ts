import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const token = this.extractToken(req);

    if (!token) {
      throw new UnauthorizedException({
        error: { code: 'AUTH_REQUIRED', message: 'Authentication required' },
      });
    }

    try {
      const payload = this.jwt.verify(token);
      (req as any).user = { userId: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException({
        error: { code: 'AUTH_REQUIRED', message: 'Invalid or expired token' },
      });
    }

    return true;
  }

  private extractToken(req: Request): string | undefined {
    // 1. Cookie (primary for web)
    const cookie = req.cookies?.access_token;
    if (cookie) return cookie;

    // 2. Authorization header (for dev/Postman)
    const auth = req.headers.authorization;
    if (auth?.startsWith('Bearer ')) return auth.slice(7);

    return undefined;
  }
}
