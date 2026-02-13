import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BullMQClient } from './bullmq.client';

const IDEMPOTENCY_TTLS: Record<string, number> = {
  AV_SCAN_DOCUMENT: 24 * 60 * 60 * 1000,
  IMAGE_DERIVATIVES: 7 * 24 * 60 * 60 * 1000,
  STORAGE_GC: 24 * 60 * 60 * 1000,
  NOTIFY_EMAIL: 24 * 60 * 60 * 1000,
};

const MAX_ATTEMPTS: Record<string, number> = {
  AV_SCAN_DOCUMENT: 3,
  IMAGE_DERIVATIVES: 3,
  STORAGE_GC: 2,
  NOTIFY_EMAIL: 5,
};

@Injectable()
export class JobsService {
  private readonly logger = new Logger('JobsService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly bullmq: BullMQClient,
  ) {}

  async enqueue(
    type: 'AV_SCAN_DOCUMENT' | 'IMAGE_DERIVATIVES' | 'STORAGE_GC' | 'NOTIFY_EMAIL',
    payload: Record<string, unknown>,
    opts?: { idempotencyKey?: string; organizationId?: string },
  ): Promise<{ jobRunId: string; deduplicated: boolean }> {
    const orgId = opts?.organizationId ?? (payload.organizationId as string) ?? null;
    const idempotencyKey = opts?.idempotencyKey ?? null;

    if (idempotencyKey) {
      const lockOrgId = orgId ?? null;
      const existingLock = await this.prisma.jobLock.findFirst({
        where: { organizationId: lockOrgId, key: idempotencyKey },
      });

      if (existingLock && existingLock.expiresAt > new Date()) {
        const existingRun = await this.prisma.jobRun.findFirst({
          where: { idempotencyKey, type, organizationId: lockOrgId, status: { in: ['QUEUED', 'RUNNING', 'SUCCESS'] } },
          orderBy: { createdAt: 'desc' },
        });
        if (existingRun) {
          this.logger.debug(`Idempotent skip: ${type} key=${idempotencyKey}`);
          return { jobRunId: existingRun.id, deduplicated: true };
        }
      }

      const ttl = IDEMPOTENCY_TTLS[type] ?? 24 * 60 * 60 * 1000;
      if (existingLock) {
        await this.prisma.jobLock.update({
          where: { id: existingLock.id },
          data: { expiresAt: new Date(Date.now() + ttl) },
        });
      } else {
        await this.prisma.jobLock.create({
          data: {
            organizationId: lockOrgId,
            key: idempotencyKey,
            expiresAt: new Date(Date.now() + ttl),
          },
        });
      }
    }

    const jobRun = await this.prisma.jobRun.create({
      data: {
        type,
        organizationId: orgId,
        idempotencyKey,
        payloadJson: payload as any,
        status: 'QUEUED',
        maxAttempts: MAX_ATTEMPTS[type] ?? 3,
      },
    });

    await this.bullmq.add(jobRun.id, type, { ...payload, jobRunId: jobRun.id });

    this.logger.log(`Enqueued ${type} jobRunId=${jobRun.id}`);
    return { jobRunId: jobRun.id, deduplicated: false };
  }

  async findAll(params: {
    type?: string;
    status?: string;
    orgId?: string;
    page?: number;
    limit?: number;
  }) {
    const page = params.page ?? 1;
    const limit = Math.min(params.limit ?? 20, 100);
    const where: any = {};
    if (params.type) where.type = params.type;
    if (params.status) where.status = params.status;
    if (params.orgId) where.organizationId = params.orgId;

    const [items, total] = await Promise.all([
      this.prisma.jobRun.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.jobRun.count({ where }),
    ]);

    return { items, total, page, limit };
  }

  async findOne(id: string) {
    return this.prisma.jobRun.findUnique({ where: { id } });
  }

  async retry(id: string) {
    const jobRun = await this.prisma.jobRun.findUnique({ where: { id } });
    if (!jobRun || jobRun.status !== 'FAILED') {
      return null;
    }

    const updated = await this.prisma.jobRun.update({
      where: { id },
      data: { status: 'QUEUED', attempts: 0, startedAt: null, finishedAt: null, lastErrorCode: null, lastErrorJson: undefined },
    });

    await this.bullmq.add(updated.id, updated.type, {
      ...(updated.payloadJson as any),
      jobRunId: updated.id,
    });

    return updated;
  }
}
