import {
  Controller,
  Post,
  Get,
  Body,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser, CurrentUserPayload } from './current-user.decorator';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RateLimitGuard, RateLimit } from '../common/guards/rate-limit.guard';
import { AuditService } from '../audit/audit.service';

const IS_PROD = process.env.NODE_ENV === 'production';

function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  res.cookie('access_token', accessToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/',
    maxAge: 15 * 60 * 1000, // 15 min
  });
  res.cookie('refresh_token', refreshToken, {
    httpOnly: true,
    secure: IS_PROD,
    sameSite: 'lax',
    path: '/api/auth',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
}

function clearAuthCookies(res: Response) {
  res.clearCookie('access_token', { path: '/' });
  res.clearCookie('refresh_token', { path: '/api/auth' });
}

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly audit: AuditService,
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 10, windowSeconds: 600, keyFn: (req) => `rl:login:ip:${req.ip || req.socket?.remoteAddress}` })
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const tokens = await this.authService.login(dto);
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      await this.audit.log({
        actorRole: 'ORG',
        actorLabel: dto.email,
        action: 'AUTH_LOGIN_SUCCESS',
        targetType: 'USER',
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      return { ok: true };
    } catch (err) {
      await this.audit.log({
        actorRole: 'ORG',
        actorLabel: dto.email,
        action: 'AUTH_LOGIN_FAIL',
        targetType: 'USER',
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      throw err;
    }
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @UseGuards(RateLimitGuard)
  @RateLimit({ max: 30, windowSeconds: 600 })
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    try {
      const refreshTokenRaw = req.cookies?.refresh_token;
      const tokens = await this.authService.refresh(refreshTokenRaw);
      setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
      await this.audit.log({
        actorRole: 'ORG',
        action: 'AUTH_REFRESH_SUCCESS',
        targetType: 'TOKEN',
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      return { ok: true };
    } catch (err) {
      await this.audit.log({
        actorRole: 'ORG',
        action: 'AUTH_REFRESH_FAIL',
        targetType: 'TOKEN',
        ip: req.ip || req.socket?.remoteAddress,
        userAgent: req.headers['user-agent'],
      });
      throw err;
    }
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshTokenRaw = req.cookies?.refresh_token;
    await this.authService.logout(refreshTokenRaw);
    clearAuthCookies(res);
    const userId = (req as any).user?.userId;
    await this.audit.log({
      userId,
      actorRole: 'ORG',
      action: 'AUTH_LOGOUT',
      targetType: 'TOKEN',
      ip: req.ip || req.socket?.remoteAddress,
      userAgent: req.headers['user-agent'],
    });
    return { ok: true };
  }

  @Get('/me')
  @UseGuards(JwtAuthGuard)
  async me(@CurrentUser() user: CurrentUserPayload) {
    return this.authService.getMe(user.userId);
  }
}
