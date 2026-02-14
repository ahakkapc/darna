import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { createHash, randomBytes } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

const BCRYPT_ROUNDS = 12;
const REFRESH_TOKEN_BYTES = 48;
const REFRESH_TOKEN_TTL_DAYS = 30;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (existing) {
      throw new AppError('EMAIL_ALREADY_USED', 409, 'Email already used');
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    const user = await this.prisma.user.create({
      data: { email: dto.email, passwordHash, name: dto.name },
    });

    return { id: user.id, email: user.email, name: user.name };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
    });
    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
    }

    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'Invalid credentials');
    }

    return this.issueTokens(user.id, user.email);
  }

  async refresh(refreshTokenRaw: string | undefined) {
    if (!refreshTokenRaw) {
      throw new AppError('REFRESH_INVALID', 401, 'Refresh token missing');
    }

    const tokenHash = this.hashToken(refreshTokenRaw);
    const existing = await this.prisma.refreshToken.findFirst({
      where: { tokenHash },
    });

    if (!existing || existing.revokedAt || existing.expiresAt < new Date()) {
      throw new AppError('REFRESH_INVALID', 401, 'Refresh token invalid or expired');
    }

    // Rotation: revoke old, issue new
    const newTokens = await this.issueTokens(existing.userId);

    await this.prisma.refreshToken.update({
      where: { id: existing.id },
      data: { revokedAt: new Date(), replacedByTokenId: newTokens.refreshTokenId },
    });

    return newTokens;
  }

  async logout(refreshTokenRaw: string | undefined) {
    if (refreshTokenRaw) {
      const tokenHash = this.hashToken(refreshTokenRaw);
      await this.prisma.refreshToken.updateMany({
        where: { tokenHash, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        phoneVerifiedAt: true,
        memberships: {
          select: {
            orgId: true,
            role: true,
            org: { select: { name: true } },
          },
        },
      },
    });

    if (!user) {
      throw new AppError('INVALID_CREDENTIALS', 401, 'User not found');
    }

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        phone: user.phone,
        phoneVerifiedAt: user.phoneVerifiedAt,
      },
      orgs: user.memberships.map((m) => ({
        orgId: m.orgId,
        name: m.org.name,
        role: m.role,
      })),
    };
  }

  private async issueTokens(userId: string, email?: string) {
    const user = email
      ? undefined
      : await this.prisma.user.findUnique({ where: { id: userId } });
    const userEmail = email ?? user?.email;
    const platformRole = user?.platformRole ?? (
      email ? (await this.prisma.user.findUnique({ where: { id: userId }, select: { platformRole: true } }))?.platformRole : undefined
    );

    const accessToken = this.jwt.sign({
      sub: userId,
      email: userEmail,
      ...(platformRole ? { platformRole } : {}),
    });

    const refreshTokenRaw = randomBytes(REFRESH_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(refreshTokenRaw);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_TTL_DAYS);

    const record = await this.prisma.refreshToken.create({
      data: { userId, tokenHash, expiresAt },
    });

    return {
      accessToken,
      refreshToken: refreshTokenRaw,
      refreshTokenId: record.id,
    };
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
