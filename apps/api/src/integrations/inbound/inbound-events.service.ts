import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { withOrg } from '../../tenancy/with-org';
import { JobsService } from '../../jobs/jobs.service';
import { INBOUND_EVENT_NOT_FOUND } from '../integration.errors';
import { maskPii } from '../utils/pii-mask';

const BACKOFF_SCHEDULE = [60, 300, 900, 3600, 21600]; // 1m,5m,15m,1h,6h

@Injectable()
export class InboundEventsService {
  private readonly logger = new Logger('InboundEventsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async createEvent(input: {
    orgId: string;
    sourceType: string;
    provider: string;
    integrationId?: string;
    externalId?: string;
    payload?: Record<string, unknown>;
    metaJson?: Record<string, unknown>;
  }): Promise<{ id: string; duplicate: boolean }> {
    const dedupeKey = input.externalId
      ? undefined
      : createHash('sha256')
          .update(`${input.sourceType}:${JSON.stringify(input.payload ?? {})}`)
          .digest('hex');

    try {
      const event: any = await withOrg(this.prisma, input.orgId, (tx) =>
        (tx as any).inboundEvent.create({
          data: {
            organizationId: input.orgId,
            sourceType: input.sourceType as any,
            provider: input.provider as any,
            integrationId: input.integrationId,
            externalId: input.externalId ?? undefined,
            dedupeKey: dedupeKey ?? undefined,
            payloadJson: input.payload ?? undefined,
            metaJson: input.metaJson ?? undefined,
            status: 'RECEIVED',
          },
        }),
      );

      await this.jobsService.enqueue('INBOUND_PROCESS_EVENT', {
        inboundEventId: event.id,
        organizationId: input.orgId,
      });

      return { id: event.id, duplicate: false };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        this.logger.debug(`Duplicate inbound event: ${input.sourceType} ext=${input.externalId}`);
        return { id: '', duplicate: true };
      }
      throw e;
    }
  }

  async findAll(orgId: string, filters?: {
    sourceType?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(filters?.limit ?? 20, 100);
    const where: any = {};
    if (filters?.sourceType) where.sourceType = filters.sourceType;
    if (filters?.status) where.status = filters.status;

    let cursorObj: any;
    if (filters?.cursor) {
      try { cursorObj = JSON.parse(Buffer.from(filters.cursor, 'base64').toString()); } catch {}
    }

    const items: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboundEvent.findMany({
        where,
        orderBy: { receivedAt: 'desc' },
        take: limit + 1,
        ...(cursorObj ? { cursor: { id: cursorObj.id }, skip: 1 } : {}),
      }),
    ) as any[];

    const hasMore = items.length > limit;
    const page = items.slice(0, limit);
    const nextCursor = hasMore
      ? Buffer.from(JSON.stringify({ id: page[page.length - 1].id })).toString('base64')
      : null;

    return { items: page, page: { limit, hasMore, nextCursor } };
  }

  async findOne(orgId: string, id: string) {
    const item: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboundEvent.findFirst({ where: { id } }),
    );
    if (!item) throw INBOUND_EVENT_NOT_FOUND();

    return {
      ...item,
      payloadJson: maskPii(item.payloadJson),
    };
  }

  async retry(orgId: string, id: string): Promise<void> {
    const item = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboundEvent.findFirst({ where: { id } }),
    );
    if (!item) throw INBOUND_EVENT_NOT_FOUND();

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).inboundEvent.update({
        where: { id },
        data: {
          status: 'RECEIVED',
          nextAttemptAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
          lastErrorMsg: null,
        },
      }),
    );

    await this.jobsService.enqueue('INBOUND_PROCESS_EVENT', {
      inboundEventId: id,
      organizationId: orgId,
    });
  }

  computeBackoff(attemptCount: number): Date {
    const idx = Math.min(attemptCount, BACKOFF_SCHEDULE.length - 1);
    return new Date(Date.now() + BACKOFF_SCHEDULE[idx] * 1000);
  }
}
