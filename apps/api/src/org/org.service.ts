import { Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { OrgRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
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
      throw new AppError('INVITE_ALREADY_EXISTS', 409, 'Active invite already exists for this email');
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
      throw new AppError('INVITE_INVALID', 400, 'Invite token is invalid');
    }

    if (invite.acceptedAt) {
      throw new AppError('INVITE_INVALID', 400, 'Invite already accepted');
    }

    if (invite.expiresAt < new Date()) {
      throw new AppError('INVITE_EXPIRED', 410, 'Invite has expired');
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
      throw new AppError('MEMBER_NOT_FOUND', 404, 'Member not found in this org');
    }

    await this.prisma.orgMembership.update({
      where: { userId_orgId: { userId: targetUserId, orgId } },
      data: { role: dto.role },
    });

    return { ok: true };
  }

  async updateProfile(callerUserId: string, orgId: string, dto: { name?: string; persona?: string; phone?: string; wilaya?: string; addressLine?: string; registryNumber?: string; registryCity?: string }) {
    await this.assertRole(callerUserId, orgId, [OrgRole.OWNER, OrgRole.MANAGER]);

    const data: Record<string, unknown> = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.persona !== undefined) data.persona = dto.persona;
    if (dto.phone !== undefined) data.phone = dto.phone;
    if (dto.wilaya !== undefined) data.wilaya = dto.wilaya;
    if (dto.addressLine !== undefined) data.addressLine = dto.addressLine;
    if (dto.registryNumber !== undefined) data.registryNumber = dto.registryNumber;
    if (dto.registryCity !== undefined) data.registryCity = dto.registryCity;

    const org = await this.prisma.org.update({
      where: { id: orgId },
      data,
      select: { id: true, name: true, persona: true, phone: true, wilaya: true, addressLine: true, registryNumber: true, registryCity: true, kycStatus: true, isVerifiedPro: true },
    });

    return org;
  }

  private async assertRole(userId: string, orgId: string, allowedRoles: OrgRole[]) {
    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId, orgId } },
    });
    if (!membership || !allowedRoles.includes(membership.role)) {
      throw new AppError('ORG_FORBIDDEN', 403, 'Insufficient role');
    }
    return membership;
  }

  private hashToken(raw: string): string {
    return createHash('sha256').update(raw).digest('hex');
  }
}
