import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { withOrg } from '../../tenancy/with-org';
import { OUTBOUND_JOB_NOT_FOUND } from '../integration.errors';
import { maskPii } from '../utils/pii-mask';
import { JobsService } from '../../jobs/jobs.service';

const BACKOFF_SCHEDULE = [60, 300, 900, 3600, 21600];

@Injectable()
export class OutboundJobsService {
  private readonly logger = new Logger('OutboundJobsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jobsService: JobsService,
  ) {}

  async createJob(input: {
    orgId: string;
    type: string;
    provider: string;
    integrationId?: string;
    payload?: Record<string, unknown>;
    dedupeKey?: string;
  }): Promise<{ id: string; duplicate: boolean }> {
    try {
      const job: any = await withOrg(this.prisma, input.orgId, (tx) =>
        (tx as any).outboundJob.create({
          data: {
            organizationId: input.orgId,
            type: input.type as any,
            provider: input.provider as any,
            integrationId: input.integrationId,
            dedupeKey: input.dedupeKey ?? undefined,
            payloadJson: input.payload ?? undefined,
            status: 'PENDING',
          },
        }),
      );

      await this.jobsService.enqueue('OUTBOUND_PROCESS_JOB', {
        outboundJobId: job.id,
        organizationId: input.orgId,
      });

      return { id: job.id, duplicate: false };
    } catch (e: any) {
      if (e?.code === 'P2002') {
        this.logger.debug(`Duplicate outbound job: ${input.type} key=${input.dedupeKey}`);
        return { id: '', duplicate: true };
      }
      throw e;
    }
  }

  async findAll(orgId: string, filters?: {
    type?: string;
    status?: string;
    cursor?: string;
    limit?: number;
  }) {
    const limit = Math.min(filters?.limit ?? 20, 100);
    const where: any = {};
    if (filters?.type) where.type = filters.type;
    if (filters?.status) where.status = filters.status;

    let cursorObj: any;
    if (filters?.cursor) {
      try { cursorObj = JSON.parse(Buffer.from(filters.cursor, 'base64').toString()); } catch {}
    }

    const items = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).outboundJob.findMany({
        where,
        orderBy: { createdAt: 'desc' },
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
      (tx as any).outboundJob.findFirst({ where: { id } }),
    );
    if (!item) throw OUTBOUND_JOB_NOT_FOUND();

    return {
      ...item,
      payloadJson: maskPii(item.payloadJson),
    };
  }

  async retry(orgId: string, id: string): Promise<void> {
    const item = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).outboundJob.findFirst({ where: { id } }),
    );
    if (!item) throw OUTBOUND_JOB_NOT_FOUND();

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).outboundJob.update({
        where: { id },
        data: {
          status: 'PENDING',
          nextAttemptAt: new Date(),
          lockedAt: null,
          lockedBy: null,
          lastErrorCode: null,
          lastErrorMsg: null,
        },
      }),
    );

    await this.jobsService.enqueue('OUTBOUND_PROCESS_JOB', {
      outboundJobId: id,
      organizationId: orgId,
    });
  }

  async cancel(orgId: string, id: string): Promise<void> {
    const item = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).outboundJob.findFirst({ where: { id } }),
    );
    if (!item) throw OUTBOUND_JOB_NOT_FOUND();

    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).outboundJob.update({
        where: { id },
        data: { status: 'CANCELED', lockedAt: null, lockedBy: null },
      }),
    );
  }

  computeBackoff(attemptCount: number): Date {
    const idx = Math.min(attemptCount, BACKOFF_SCHEDULE.length - 1);
    return new Date(Date.now() + BACKOFF_SCHEDULE[idx] * 1000);
  }
}
