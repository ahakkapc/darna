import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import {
  SEQUENCE_NOT_FOUND,
  SEQUENCE_INVALID_STEPS,
  SEQUENCE_NOT_ACTIVE,
  SEQUENCE_ALREADY_RUNNING,
  SEQUENCE_RUN_NOT_FOUND,
  TEMPLATE_CHANNEL_MISMATCH,
} from './sequence.errors';

@Injectable()
export class MessageSequencesService {
  private readonly logger = new Logger('MessageSequencesService');

  constructor(private readonly prisma: PrismaService) {}

  /* ─── Sequence CRUD ──────────────────────────────────── */

  async create(
    orgId: string,
    dto: { name: string; description?: string; defaultStartDelayMinutes?: number; stopOnReply?: boolean },
    userId: string,
  ) {
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.create({
        data: {
          organizationId: orgId,
          name: dto.name,
          description: dto.description ?? null,
          defaultStartDelayMinutes: dto.defaultStartDelayMinutes ?? 0,
          stopOnReply: dto.stopOnReply ?? true,
          createdByUserId: userId,
          updatedByUserId: userId,
        },
      }),
    );
  }

  async findAll(orgId: string, filters?: { status?: string }) {
    const where: Record<string, unknown> = {};
    if (filters?.status) where.status = filters.status;
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { steps: { orderBy: { orderIndex: 'asc' } } },
      }),
    );
  }

  async findOne(orgId: string, id: string) {
    const s: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.findFirst({
        where: { id },
        include: { steps: { orderBy: { orderIndex: 'asc' }, include: { template: true } } },
      }),
    );
    if (!s) throw SEQUENCE_NOT_FOUND();
    return s;
  }

  async update(
    orgId: string,
    id: string,
    dto: { name?: string; description?: string; defaultStartDelayMinutes?: number; stopOnReply?: boolean },
    userId: string,
  ) {
    await this.findOne(orgId, id);
    const data: Record<string, unknown> = { updatedByUserId: userId };
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.description !== undefined) data.description = dto.description;
    if (dto.defaultStartDelayMinutes !== undefined) data.defaultStartDelayMinutes = dto.defaultStartDelayMinutes;
    if (dto.stopOnReply !== undefined) data.stopOnReply = dto.stopOnReply;

    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.update({ where: { id }, data }),
    );
  }

  async activate(orgId: string, id: string) {
    const seq: any = await this.findOne(orgId, id);
    if (!seq.steps || seq.steps.length === 0) {
      throw SEQUENCE_INVALID_STEPS('sequence must have at least one step');
    }
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.update({ where: { id }, data: { status: 'ACTIVE' } }),
    );
  }

  async pause(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.update({ where: { id }, data: { status: 'PAUSED' } }),
    );
  }

  async archive(orgId: string, id: string) {
    await this.findOne(orgId, id);
    return withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequence.update({ where: { id }, data: { status: 'ARCHIVED' } }),
    );
  }

  /* ─── Steps (atomic replace) ─────────────────────────── */

  async replaceSteps(
    orgId: string,
    sequenceId: string,
    steps: Array<{
      orderIndex: number;
      channel: string;
      templateId: string;
      delayMinutes: number;
      conditions?: unknown[];
      createTaskJson?: unknown;
      notifyJson?: unknown;
    }>,
  ) {
    const seq: any = await this.findOne(orgId, sequenceId);
    if (seq.status !== 'DRAFT' && seq.status !== 'PAUSED') {
      throw SEQUENCE_INVALID_STEPS('sequence must be DRAFT or PAUSED to modify steps');
    }

    // Validate orderIndex: 0..N contiguous
    const sorted = [...steps].sort((a, b) => a.orderIndex - b.orderIndex);
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].orderIndex !== i) {
        throw SEQUENCE_INVALID_STEPS('orderIndex must be 0..N without gaps');
      }
    }

    // Validate delayMinutes strictly increasing
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i].delayMinutes <= sorted[i - 1].delayMinutes) {
        throw SEQUENCE_INVALID_STEPS('delayMinutes must be strictly increasing');
      }
    }

    // Validate templates exist and channel matches
    for (const step of sorted) {
      const tmpl: any = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageTemplate.findFirst({ where: { id: step.templateId } }),
      );
      if (!tmpl) throw SEQUENCE_INVALID_STEPS(`template ${step.templateId} not found`);
      if (tmpl.channel !== step.channel) throw TEMPLATE_CHANNEL_MISMATCH();
    }

    // Atomic: delete old, create new
    await withOrg(this.prisma, orgId, async (tx) => {
      await (tx as any).messageSequenceStep.deleteMany({ where: { sequenceId } });
      for (const step of sorted) {
        await (tx as any).messageSequenceStep.create({
          data: {
            organizationId: orgId,
            sequenceId,
            orderIndex: step.orderIndex,
            channel: step.channel,
            templateId: step.templateId,
            delayMinutes: step.delayMinutes,
            conditionsJson: step.conditions ?? null,
            createTaskJson: step.createTaskJson ?? null,
            notifyJson: step.notifyJson ?? null,
          },
        });
      }
    });

    return this.findOne(orgId, sequenceId);
  }

  /* ─── Runs ───────────────────────────────────────────── */

  async startRun(orgId: string, leadId: string, sequenceId: string, userId: string) {
    const seq: any = await this.findOne(orgId, sequenceId);
    if (seq.status !== 'ACTIVE') throw SEQUENCE_NOT_ACTIVE();

    // Verify lead exists
    const lead: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).lead.findFirst({ where: { id: leadId }, select: { id: true } }),
    );
    if (!lead) throw SEQUENCE_NOT_FOUND();

    const now = new Date();
    const startedAt = new Date(now.getTime() + (seq.defaultStartDelayMinutes ?? 0) * 60_000);
    const firstStep = seq.steps?.[0];
    const nextStepAt = firstStep
      ? new Date(startedAt.getTime() + firstStep.delayMinutes * 60_000)
      : null;

    try {
      const run: any = await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageSequenceRun.create({
          data: {
            organizationId: orgId,
            sequenceId,
            leadId,
            status: 'RUNNING',
            startedAt,
            nextStepIndex: 0,
            nextStepAt,
            createdByUserId: userId,
          },
        }),
      );
      return run;
    } catch (e: any) {
      if (e?.code === 'P2002') throw SEQUENCE_ALREADY_RUNNING();
      throw e;
    }
  }

  async stopRun(orgId: string, leadId: string, runId: string) {
    const run: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequenceRun.findFirst({ where: { id: runId, leadId } }),
    );
    if (!run) throw SEQUENCE_RUN_NOT_FOUND();

    await withOrg(this.prisma, orgId, async (tx) => {
      await (tx as any).messageSequenceRun.update({
        where: { id: runId },
        data: { status: 'CANCELED', stoppedAt: new Date() },
      });
      // Cancel pending run steps
      await (tx as any).messageSequenceRunStep.updateMany({
        where: { runId, status: { in: ['PENDING', 'SCHEDULED'] } },
        data: { status: 'CANCELED' },
      });
    });

    return { ok: true };
  }

  async listRuns(orgId: string, leadId: string) {
    const runs: any[] = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequenceRun.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
        include: {
          sequence: { select: { id: true, name: true } },
          runSteps: { orderBy: { orderIndex: 'asc' } },
        },
      }),
    );
    return runs;
  }
}
