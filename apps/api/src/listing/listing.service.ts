import { Injectable } from '@nestjs/common';
import { OrgRole, ListingStatus, RecordStatus, SubscriptionStatus, ModerationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AppError } from '../common/errors/app-error';
import { withOrg } from '../tenancy/with-org';
import { CreateListingDto } from './dto/create-listing.dto';
import { UpdateListingDto } from './dto/update-listing.dto';

@Injectable()
export class ListingService {
  constructor(private readonly prisma: PrismaService) {}

  async create(orgId: string, userId: string, userRole: OrgRole, dto: CreateListingDto) {
    const ownerUserId = this.resolveOwner(userId, userRole, dto.ownerUserId);

    if (ownerUserId !== userId) {
      const membership = await this.prisma.orgMembership.findUnique({
        where: { userId_orgId: { userId: ownerUserId, orgId } },
      });
      if (!membership) {
        throw new AppError('MEMBER_NOT_FOUND', 404, 'Target owner is not a member of this org');
      }
    }

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.create({
        data: {
          organizationId: orgId,
          ownerUserId,
          createdByUserId: userId,
          dealType: dto.dealType as any,
          type: dto.type as any,
          wilaya: dto.wilaya,
          commune: dto.commune,
          quartier: dto.quartier,
          addressLine: dto.addressLine,
          title: dto.title,
          description: dto.description,
          priceDa: dto.priceDa,
          surfaceM2: dto.surfaceM2,
          rooms: dto.rooms,
          floor: dto.floor,
          hasElevator: dto.hasElevator,
          hasParking: dto.hasParking,
          hasBalcony: dto.hasBalcony,
          furnished: dto.furnished,
        },
      }),
    );
  }

  async findAll(
    orgId: string,
    userId: string,
    userRole: OrgRole,
    filters: { scope?: string; status?: string; dealType?: string; wilaya?: string; q?: string; take?: number; cursor?: string },
  ) {
    const isManager = userRole === OrgRole.OWNER || userRole === OrgRole.MANAGER;
    const where: Record<string, unknown> = { recordStatus: RecordStatus.ACTIVE };

    if (!isManager || filters.scope === 'me') {
      where.ownerUserId = userId;
    }
    if (filters.status) where.status = filters.status;
    if (filters.dealType) where.dealType = filters.dealType;
    if (filters.wilaya) where.wilaya = filters.wilaya;
    if (filters.q) where.title = { contains: filters.q, mode: 'insensitive' };

    const take = Math.min(filters.take ?? 20, 50);

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        take,
        select: {
          id: true,
          ownerUserId: true,
          dealType: true,
          type: true,
          status: true,
          wilaya: true,
          title: true,
          priceDa: true,
          photoQualityScore: true,
          photoQualityStatus: true,
          publishedAt: true,
          updatedAt: true,
          ...(isManager ? { owner: { select: { id: true, email: true, name: true } } } : {}),
        },
      }),
    );
  }

  async findOne(orgId: string, userId: string, userRole: OrgRole, listingId: string) {
    const listing = await withOrg(this.prisma, orgId, (tx) =>
      tx.listing.findFirst({
        where: { id: listingId, recordStatus: RecordStatus.ACTIVE },
        include: {
          owner: { select: { id: true, email: true, name: true } },
          moderation: true,
        },
      }),
    );

    if (!listing) throw new AppError('LISTING_NOT_FOUND', 404, 'Listing not found');

    const isManager = userRole === OrgRole.OWNER || userRole === OrgRole.MANAGER;
    if (!isManager && listing.ownerUserId !== userId) {
      throw new AppError('LISTING_NOT_FOUND', 404, 'Listing not found');
    }

    return listing;
  }

  async update(orgId: string, userId: string, userRole: OrgRole, listingId: string, dto: UpdateListingDto) {
    const listing = await this.findOne(orgId, userId, userRole, listingId);

    const isManager = userRole === OrgRole.OWNER || userRole === OrgRole.MANAGER;
    const isOwner = listing.ownerUserId === userId;

    if (!isManager && !isOwner) {
      throw new AppError('LISTING_NOT_FOUND', 404, 'Listing not found');
    }

    if (userRole === OrgRole.VIEWER && isOwner) {
      const allowed = ['description', 'status'];
      for (const key of Object.keys(dto)) {
        if (!allowed.includes(key)) {
          throw new AppError('ORG_FORBIDDEN', 403, `Assistant cannot update field: ${key}`);
        }
      }
      if (dto.status && dto.status !== 'DRAFT' && dto.status !== 'PAUSED') {
        throw new AppError('ORG_FORBIDDEN', 403, 'Assistant can only set DRAFT or PAUSED');
      }
    }

    if (!isManager && dto.status === 'PUBLISHED') {
      if (userRole === OrgRole.VIEWER) {
        throw new AppError('ORG_FORBIDDEN', 403, 'Assistant cannot publish');
      }
    }

    const data: Record<string, unknown> = {};
    if (dto.wilaya !== undefined) data.wilaya = dto.wilaya;
    if (dto.commune !== undefined) data.commune = dto.commune;
    if (dto.quartier !== undefined) data.quartier = dto.quartier;
    if (dto.addressLine !== undefined) data.addressLine = dto.addressLine;
    if (dto.title !== undefined) data.title = dto.title;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.priceDa !== undefined) data.priceDa = dto.priceDa;
    if (dto.surfaceM2 !== undefined) data.surfaceM2 = dto.surfaceM2;
    if (dto.rooms !== undefined) data.rooms = dto.rooms;
    if (dto.floor !== undefined) data.floor = dto.floor;
    if (dto.hasElevator !== undefined) data.hasElevator = dto.hasElevator;
    if (dto.hasParking !== undefined) data.hasParking = dto.hasParking;
    if (dto.hasBalcony !== undefined) data.hasBalcony = dto.hasBalcony;
    if (dto.furnished !== undefined) data.furnished = dto.furnished;
    if (dto.visibility !== undefined) data.visibility = dto.visibility;

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.update({ where: { id: listingId }, data }),
    );
  }

  async publish(orgId: string, userId: string, userRole: OrgRole, listingId: string) {
    if (userRole === OrgRole.VIEWER) {
      throw new AppError('ORG_FORBIDDEN', 403, 'Assistant cannot publish listings');
    }

    const listing = await this.findOne(orgId, userId, userRole, listingId);

    if (['SOLD', 'RENTED', 'EXPIRED'].includes(listing.status)) {
      throw new AppError('LISTING_NOT_PUBLISHABLE', 409, `Listing status ${listing.status} cannot be published`);
    }

    const org = await this.prisma.org.findUnique({
      where: { id: orgId },
      select: { isVerifiedPro: true, kycStatus: true },
    });

    if (!org?.isVerifiedPro) {
      throw new AppError('KYC_REQUIRED', 403, 'Organization KYC must be verified before publishing');
    }

    const activeSub = await this.prisma.subscription.findFirst({
      where: { organizationId: orgId, status: SubscriptionStatus.ACTIVE, endAt: { gt: new Date() } },
    });
    if (!activeSub) {
      throw new AppError('SUBSCRIPTION_REQUIRED', 403, 'Active subscription required to publish');
    }

    const moderation = await this.prisma.listingModeration.findUnique({
      where: { listingId },
    });
    if (!moderation || moderation.status !== ModerationStatus.APPROVED) {
      throw new AppError('MODERATION_REQUIRED', 403, 'Listing must be approved by moderation before publishing');
    }

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.PUBLISHED, publishedAt: new Date(), pausedAt: null },
      }),
    );
  }

  async pause(orgId: string, userId: string, userRole: OrgRole, listingId: string) {
    const listing = await this.findOne(orgId, userId, userRole, listingId);

    const isManager = userRole === OrgRole.OWNER || userRole === OrgRole.MANAGER;
    if (!isManager && listing.ownerUserId !== userId) {
      throw new AppError('ORG_FORBIDDEN', 403, 'Cannot pause listing you do not own');
    }

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.update({
        where: { id: listingId },
        data: { status: ListingStatus.PAUSED, pausedAt: new Date() },
      }),
    );
  }

  async transfer(orgId: string, userId: string, userRole: OrgRole, listingId: string, newOwnerUserId: string) {
    if (userRole !== OrgRole.OWNER && userRole !== OrgRole.MANAGER) {
      throw new AppError('ORG_FORBIDDEN', 403, 'Only managers can transfer listings');
    }

    await this.findOne(orgId, userId, userRole, listingId);

    const membership = await this.prisma.orgMembership.findUnique({
      where: { userId_orgId: { userId: newOwnerUserId, orgId } },
    });
    if (!membership) {
      throw new AppError('MEMBER_NOT_FOUND', 404, 'Target owner is not a member of this org');
    }

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.update({
        where: { id: listingId },
        data: { ownerUserId: newOwnerUserId },
      }),
    );
  }

  async softDelete(orgId: string, userId: string, userRole: OrgRole, listingId: string) {
    if (userRole !== OrgRole.OWNER && userRole !== OrgRole.MANAGER) {
      throw new AppError('ORG_FORBIDDEN', 403, 'Only managers can delete listings');
    }

    await this.findOne(orgId, userId, userRole, listingId);

    return withOrg(this.prisma, orgId, (tx) =>
      tx.listing.update({
        where: { id: listingId },
        data: { recordStatus: RecordStatus.DELETED, deletedAt: new Date(), deletedByUserId: userId },
      }),
    );
  }

  private resolveOwner(userId: string, userRole: OrgRole, requestedOwner?: string): string {
    const isManager = userRole === OrgRole.OWNER || userRole === OrgRole.MANAGER;
    if (requestedOwner && isManager) return requestedOwner;
    return userId;
  }
}
