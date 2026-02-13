import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

const IS_PROD = process.env.NODE_ENV === 'production';

@Injectable()
export class SecurityHeadersMiddleware implements NestMiddleware {
  use(_req: Request, res: Response, next: NextFunction) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (IS_PROD) {
      res.setHeader(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains',
      );
    }

    const scriptSrc = IS_PROD ? "'self'" : "'self' 'unsafe-eval'";
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self'; frame-ancestors 'none'; img-src 'self' data: blob: https:; script-src ${scriptSrc}`,
    );

    next();
  }
}
