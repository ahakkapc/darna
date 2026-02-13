import { Injectable } from '@nestjs/common';
import { ModerationStatus, RecordStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { withOrg } from '../tenancy/with-org';

@Injectable()
export class ModerationService {
  constructor(private readonly prisma: PrismaService) {}

  async submitForReview(orgId: string, listingId: string) {
    const listing = await withOrg(this.prisma, orgId, (tx) =>
      tx.listing.findFirst({ where: { id: listingId, recordStatus: RecordStatus.ACTIVE } }),
    );
    if (!listing) throw new AppError('LISTING_NOT_FOUND', 404, 'Listing not found');

    const autoChecks: Record<string, boolean | string | number | null> = {};
    let autoDecision: ModerationStatus = ModerationStatus.PENDING_REVIEW;

    const hasTitle = !!listing.title && listing.title.length >= 10;
    const hasPrice = listing.priceDa > 0;
    const hasWilaya = !!listing.wilaya;
    autoChecks.hasTitle = hasTitle;
    autoChecks.hasPrice = hasPrice;
    autoChecks.hasWilaya = hasWilaya;

    if (!hasTitle || !hasPrice || !hasWilaya) {
      autoDecision = ModerationStatus.REJECTED;
      autoChecks.reason = 'Missing required fields';
    }

    const photoScore = listing.photoQualityScore;
    if (photoScore !== null && photoScore < 60) {
      autoDecision = ModerationStatus.REJECTED;
      autoChecks.photoRejected = true;
    } else if (photoScore !== null && photoScore >= 60 && autoDecision !== ModerationStatus.REJECTED) {
      if (hasTitle && hasPrice && hasWilaya) {
        autoDecision = ModerationStatus.APPROVED;
      }
    } else if (photoScore === null) {
      autoChecks.photoScorePending = true;
    }

    const existing = await this.prisma.listingModeration.findUnique({ where: { listingId } });

    if (existing) {
      await this.prisma.listingModeration.update({
        where: { listingId },
        data: {
          status: autoDecision,
          submittedAt: new Date(),
          autoChecksJson: autoChecks as any,
          reviewedAt: null,
          reviewedByUserId: null,
          decisionReason: null,
        },
      });
    } else {
      await this.prisma.listingModeration.create({
        data: {
          organizationId: orgId,
          listingId,
          status: autoDecision,
          autoChecksJson: autoChecks as any,
        },
      });
    }

    return { ok: true, status: autoDecision, autoChecks };
  }

  async getModeration(orgId: string, listingId: string) {
    const moderation = await withOrg(this.prisma, orgId, (tx) =>
      tx.listingModeration.findUnique({ where: { listingId } }),
    );
    if (!moderation) throw new AppError('NOT_FOUND', 404, 'No moderation record for this listing');
    return moderation;
  }

  // --- Admin methods (no RLS) ---

  async adminGetQueue(status?: string) {
    const where: Record<string, unknown> = {};
    if (status) where.status = status;

    return this.prisma.listingModeration.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      take: 50,
      include: {
        listing: {
          select: { id: true, organizationId: true, title: true, wilaya: true, status: true, ownerUserId: true },
        },
      },
    });
  }

  async adminApprove(listingId: string, adminUserId: string) {
    const moderation = await this.prisma.listingModeration.findUnique({ where: { listingId } });
    if (!moderation) throw new AppError('NOT_FOUND', 404, 'Moderation record not found');

    await this.prisma.listingModeration.update({
      where: { listingId },
      data: {
        status: ModerationStatus.APPROVED,
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
      },
    });

    return { ok: true };
  }

  async adminReject(listingId: string, adminUserId: string, reason?: string) {
    const moderation = await this.prisma.listingModeration.findUnique({ where: { listingId } });
    if (!moderation) throw new AppError('NOT_FOUND', 404, 'Moderation record not found');

    await this.prisma.listingModeration.update({
      where: { listingId },
      data: {
        status: ModerationStatus.REJECTED,
        reviewedAt: new Date(),
        reviewedByUserId: adminUserId,
        decisionReason: reason,
      },
    });

    return { ok: true };
  }
}
