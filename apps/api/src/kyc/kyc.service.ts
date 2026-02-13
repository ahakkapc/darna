import { Injectable } from '@nestjs/common';
import { KycStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { SubmitKycDto } from './dto/submit-kyc.dto';

@Injectable()
export class KycService {
  constructor(private readonly prisma: PrismaService) {}

  async getMe(orgId: string) {
    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: {
        id: true,
        kycStatus: true,
        isVerifiedPro: true,
        kycRejectionReason: true,
        kycSubmittedAt: true,
        kycVerifiedAt: true,
      },
    });
    if (!org) throw new AppError('ORG_NOT_FOUND', 404, 'Organization not found');

    const latestRequest = await this.prisma.kycRequest.findFirst({
      where: { organizationId: orgId },
      orderBy: { submittedAt: 'desc' },
      select: {
        id: true,
        status: true,
        registryNumber: true,
        submittedAt: true,
        reviewedAt: true,
        decisionReason: true,
      },
    });

    return { org, latestRequest };
  }

  async submit(orgId: string, dto: SubmitKycDto) {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new AppError('ORG_NOT_FOUND', 404, 'Organization not found');

    const request = await this.prisma.kycRequest.create({
      data: {
        organizationId: orgId,
        status: KycStatus.SUBMITTED,
        registryNumber: dto.registryNumber,
        registryCity: dto.registryCity,
        legalName: dto.legalName,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
      },
    });

    await this.prisma.org.update({
      where: { id: orgId },
      data: {
        kycStatus: KycStatus.SUBMITTED,
        kycSubmittedAt: new Date(),
        kycRejectionReason: null,
      },
    });

    return { ok: true, requestId: request.id };
  }

  async resubmit(orgId: string, dto: SubmitKycDto) {
    const org = await this.prisma.org.findUnique({ where: { id: orgId } });
    if (!org) throw new AppError('ORG_NOT_FOUND', 404, 'Organization not found');

    if (org.kycStatus !== KycStatus.NEEDS_CHANGES && org.kycStatus !== KycStatus.REJECTED) {
      throw new AppError('INVALID_KYC_STATE', 409, 'Resubmit only allowed when status is NEEDS_CHANGES or REJECTED');
    }

    const request = await this.prisma.kycRequest.create({
      data: {
        organizationId: orgId,
        status: KycStatus.SUBMITTED,
        registryNumber: dto.registryNumber,
        registryCity: dto.registryCity,
        legalName: dto.legalName,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
      },
    });

    await this.prisma.org.update({
      where: { id: orgId },
      data: {
        kycStatus: KycStatus.SUBMITTED,
        kycSubmittedAt: new Date(),
        kycRejectionReason: null,
      },
    });

    return { ok: true, requestId: request.id };
  }

  // --- Admin methods (no RLS, use PrismaService directly as superuser) ---

  async adminGetQueue(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.prisma.kycRequest.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      take: 50,
      include: {
        organization: { select: { id: true, name: true, persona: true, kycStatus: true } },
      },
    });
  }

  async adminGetById(requestId: string) {
    const request = await this.prisma.kycRequest.findUnique({
      where: { id: requestId },
      include: {
        organization: { select: { id: true, name: true, persona: true, phone: true, registryNumber: true } },
      },
    });
    if (!request) throw new AppError('NOT_FOUND', 404, 'KYC request not found');
    return request;
  }

  async adminVerify(requestId: string, adminUserId: string) {
    const request = await this.prisma.kycRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError('NOT_FOUND', 404, 'KYC request not found');

    await this.prisma.kycRequest.update({
      where: { id: requestId },
      data: { status: KycStatus.VERIFIED, reviewedAt: new Date(), reviewedByUserId: adminUserId },
    });

    await this.prisma.org.update({
      where: { id: request.organizationId },
      data: {
        kycStatus: KycStatus.VERIFIED,
        isVerifiedPro: true,
        kycVerifiedAt: new Date(),
        kycReviewedByUserId: adminUserId,
        kycRejectionReason: null,
      },
    });

    return { ok: true };
  }

  async adminNeedsChanges(requestId: string, adminUserId: string, reason?: string) {
    const request = await this.prisma.kycRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError('NOT_FOUND', 404, 'KYC request not found');

    await this.prisma.kycRequest.update({
      where: { id: requestId },
      data: { status: KycStatus.NEEDS_CHANGES, reviewedAt: new Date(), reviewedByUserId: adminUserId, decisionReason: reason },
    });

    await this.prisma.org.update({
      where: { id: request.organizationId },
      data: {
        kycStatus: KycStatus.NEEDS_CHANGES,
        isVerifiedPro: false,
        kycReviewedByUserId: adminUserId,
        kycRejectionReason: reason,
      },
    });

    return { ok: true };
  }

  async adminReject(requestId: string, adminUserId: string, reason?: string) {
    const request = await this.prisma.kycRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new AppError('NOT_FOUND', 404, 'KYC request not found');

    await this.prisma.kycRequest.update({
      where: { id: requestId },
      data: { status: KycStatus.REJECTED, reviewedAt: new Date(), reviewedByUserId: adminUserId, decisionReason: reason },
    });

    await this.prisma.org.update({
      where: { id: request.organizationId },
      data: {
        kycStatus: KycStatus.REJECTED,
        isVerifiedPro: false,
        kycReviewedByUserId: adminUserId,
        kycRejectionReason: reason,
      },
    });

    return { ok: true };
  }
}
