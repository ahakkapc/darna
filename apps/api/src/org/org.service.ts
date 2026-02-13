import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
  BadRequestException,
  GoneException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrgDto } from './dto/create-org.dto';
import { InviteDto } from './dto/invite.dto';
import { ChangeRoleDto } from './dto/change-role.dto';

const INVITE_TOKEN_BYTES = 32;
const INVITE_TTL_DAYS = 7;

@Injectable()
export class OrgService {
  constructor(private readonly prisma: PrismaService) {}

  async create(userId: string, dto: CreateOrgDto) {
    const org = await this.prisma.org.create({ data: { name: dto.name } });
    await this.prisma.orgMembership.create({
      data: { userId, orgId: org.id, role: OrgRole.OWNER },
    });
    return { orgId: org.id, name: org.name };
  }

  async listForUser(userId: string) {
    const memberships = await this.prisma.orgMembership.findMany({
      where: { userId },
      select: {
        orgId: true,
        role: true,
        org: { select: { name: true } },
      },
    });
    return memberships.map((m) => ({
      orgId: m.orgId,
      name: m.org.name,
      role: m.role,
    }));
  }

  async invite(callerUserId: string, orgId: string, dto: InviteDto) {
    await this.assertRole(callerUserId, orgId, [OrgRole.OWNER, OrgRole.MANAGER]);

    const existing = await this.prisma.orgInvite.findFirst({
      where: { orgId, email: dto.email, acceptedAt: null, expiresAt: { gt: new Date() } },
    });
    if (existing) {
      throw new ConflictException({
        error: { code: 'INVITE_ALREADY_EXISTS', message: 'Active invite already exists for this email' },
      });
    }

    const tokenRaw = randomBytes(INVITE_TOKEN_BYTES).toString('hex');
    const tokenHash = this.hashToken(tokenRaw);
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + INVITE_TTL_DAYS);

    const invite = await this.prisma.orgInvite.create({
      data: { orgId, email: dto.email, role: dto.role, tokenHash, expiresAt },
    });

    return { inviteId: invite.id, token: tokenRaw };
  }

  async acceptInvite(callerUserId: string, tokenRaw: string) {
    const tokenHash = this.hashToken(tokenRaw);
    const invite = await this.prisma.orgInvite.findFirst({
      where: { tokenHash },
    });

    if (!invite) {
      throw new BadRequestException({
        error: { code: 'INVITE_INVALID', message: 'Invite token is invalid' },
      });
    }

    if (invite.acceptedAt) {
      throw new BadRequestException({
        error: { code: 'INVITE_INVALID', message: 'Invite already accepted' },
      });
    }

    if (invite.expiresAt < new Date()) {
      throw new GoneException({
        error: { code: 'INVITE_EXPIRED', message: 'Invite has expired' },
      });
    }

    await this.prisma.orgMembership.upsert({
      where: { userId_orgId: { userId: callerUserId, orgId: invite.orgId } },
      create: { userId: callerUserId, orgId: invite.orgId, role: invite.role },
      update: { role: invite.role },
    });

    await this.prisma.orgInvite.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date(), acceptedByUserId: callerUserId },
    });

    return { ok: true, orgId: invite.orgId, role: invite.role };
  }

  async listMembers(callerUserId: string, orgId: string) {
    await this.assertRole(callerUserId, orgId, [OrgRole.OWNER, OrgRole.MANAGER]);

    const members = await this.prisma.orgMembership.findMany({
      where: { orgId },
      select: {
        userId: true,
        role: true,
        user: { select: { email: true, name: true } },
      },
    });
    return members.map((m) => ({
      userId: m.userId,
      email: m.user.email,
      name: m.user.name,
      role: m.role,
    }));
  }

  async changeRole(callerUserId: string, orgId: string, targetUserId: string, dto: ChangeRoleDto) {
    await this.assertRole(callerUserId, orgId, [OrgRole.OWNER]);

    const targetMembership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: targetUserId, orgId } },
    });
    if (!targetMembership) {
      throw new NotFoundException({
        error: { code: 'MEMBER_NOT_FOUND', message: 'Member not found in this org' },
      });
    }

    await this.prisma.orgMembership.update({
      where: { userId_orgId: { userId: targetUserId, orgId } },
      data: { role: dto.role },
    });

    return { ok: true };
  }

  private async assertRole(userId: string, orgId: string, allowedRoles: OrgRole[]) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new ForbiddenException({
        error: { code: 'ORG_FORBIDDEN', message: 'Insufficient role' },
      });
    }
    return membership;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
