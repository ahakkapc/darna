import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { withOrg } from '../tenancy/with-org';
import { OutboundJobsService } from '../integrations/outbound/outbound-jobs.service';
import { SequenceRendererService } from './sequence-renderer.service';
import { PROVIDER_NOT_CONFIGURED } from './sequence.errors';

const E164_RE = /^\+[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface Condition {
  key: string;
  params?: Record<string, unknown>;
}

@Injectable()
export class SequenceTickService {
  private readonly logger = new Logger('SequenceTickService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboundJobs: OutboundJobsService,
    private readonly renderer: SequenceRendererService,
  ) {}

  async tick(): Promise<{ processed: number; errors: number }> {
    const now = new Date();
    let processed = 0;
    let errors = 0;

    // Find all RUNNING runs with nextStepAt <= now across all orgs (superuser query)
    const runs: any[] = await this.prisma.messageSequenceRun.findMany({
      where: {
        status: 'RUNNING',
        nextStepAt: { lte: now },
      },
      take: 50,
      orderBy: { nextStepAt: 'asc' },
      include: {
        sequence: {
          include: { steps: { orderBy: { orderIndex: 'asc' }, include: { template: true } } },
        },
      },
    });

    for (const run of runs) {
      try {
        await this.processRun(run);
        processed++;
      } catch (e: any) {
        errors++;
        this.logger.warn('Tick processRun error', { runId: run.id, error: e.message?.slice(0, 200) });
      }
    }

    return { processed, errors };
  }

  private async processRun(run: any): Promise<void> {
    const orgId = run.organizationId;
    const seq = run.sequence;
    const steps = seq?.steps ?? [];

    // Re-check status
    if (run.status !== 'RUNNING') return;

    // Check stopOnReply
    if (seq.stopOnReply) {
      const hasReply = await this.checkReply(orgId, run.leadId, run.startedAt);
      if (hasReply) {
        await withOrg(this.prisma, orgId, (tx) =>
          (tx as any).messageSequenceRun.update({
            where: { id: run.id },
            data: { status: 'CANCELED', stoppedAt: new Date(), nextStepAt: null },
          }),
        );
        this.logger.log(`Run ${run.id} canceled: reply detected`);
        return;
      }
    }

    const stepDef = steps[run.nextStepIndex];
    if (!stepDef) {
      // No more steps → COMPLETED
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageSequenceRun.update({
          where: { id: run.id },
          data: { status: 'COMPLETED', stoppedAt: new Date(), nextStepAt: null },
        }),
      );
      return;
    }

    // Load lead + org + owner
    const lead: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).lead.findFirst({ where: { id: run.leadId } }),
    );
    if (!lead) {
      await this.failRun(orgId, run.id, 'LEAD_NOT_FOUND');
      return;
    }

    const org: any = await this.prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
    let owner: any = null;
    if (lead.ownerUserId) {
      owner = await this.prisma.user.findUnique({ where: { id: lead.ownerUserId }, select: { name: true } });
    }

    // Evaluate conditions
    const conditions: Condition[] = Array.isArray(stepDef.conditionsJson) ? stepDef.conditionsJson : [];
    const conditionPassed = this.evaluateConditions(conditions, lead);

    // Create RunStep
    const runStep: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequenceRunStep.create({
        data: {
          organizationId: orgId,
          runId: run.id,
          stepId: stepDef.id,
          orderIndex: stepDef.orderIndex,
          status: conditionPassed ? 'SCHEDULED' : 'SKIPPED',
          scheduledAt: conditionPassed ? new Date() : null,
        },
      }),
    );

    if (!conditionPassed) {
      await this.advanceRun(orgId, run, steps);
      return;
    }

    // Render template
    const template = stepDef.template;
    const context = this.renderer.buildContext(lead, org, owner);
    const { renderedBody, renderedSubject } = this.renderer.renderTemplate(
      template.body, template.subject, context,
    );

    // Find provider integration
    const integrationType = stepDef.channel === 'WHATSAPP' ? 'WHATSAPP_PROVIDER' : 'EMAIL_PROVIDER';
    const integration: any = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).integration.findFirst({
        where: { type: integrationType, status: 'ACTIVE' },
        select: { id: true, provider: true },
      }),
    );

    if (!integration) {
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageSequenceRunStep.update({
          where: { id: runStep.id },
          data: { status: 'FAILED', lastErrorCode: 'PROVIDER_NOT_CONFIGURED', lastErrorMsg: `No active ${stepDef.channel} provider` },
        }),
      );
      await this.advanceRun(orgId, run, steps);
      return;
    }

    // Build outbound job
    const dedupeKey = `seq:${run.id}:step:${stepDef.orderIndex}`;
    const isWhatsApp = stepDef.channel === 'WHATSAPP';
    const toPhone = lead.phone ?? null;
    const toEmail = lead.email ?? null;

    if (isWhatsApp && (!toPhone || !E164_RE.test(toPhone))) {
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageSequenceRunStep.update({
          where: { id: runStep.id },
          data: { status: 'SKIPPED', lastErrorCode: 'NO_VALID_PHONE' },
        }),
      );
      await this.advanceRun(orgId, run, steps);
      return;
    }

    if (!isWhatsApp && (!toEmail || !EMAIL_RE.test(toEmail))) {
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageSequenceRunStep.update({
          where: { id: runStep.id },
          data: { status: 'SKIPPED', lastErrorCode: 'NO_VALID_EMAIL' },
        }),
      );
      await this.advanceRun(orgId, run, steps);
      return;
    }

    const payload: Record<string, unknown> = isWhatsApp
      ? { toPhone, text: renderedBody, leadId: run.leadId, sequenceRunId: run.id, stepIndex: stepDef.orderIndex }
      : { toEmail, subject: renderedSubject, body: renderedBody, leadId: run.leadId, sequenceRunId: run.id, stepIndex: stepDef.orderIndex };

    const jobResult = await this.outboundJobs.createJob({
      orgId,
      type: isWhatsApp ? 'WHATSAPP_MESSAGE' : 'EMAIL_MESSAGE',
      provider: integration.provider,
      integrationId: integration.id,
      dedupeKey,
      payload,
    });

    // Update runStep
    const stepStatus = jobResult.duplicate ? 'SENT' : 'SCHEDULED';
    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequenceRunStep.update({
        where: { id: runStep.id },
        data: {
          status: stepStatus,
          outboundJobId: jobResult.id || undefined,
          sentAt: jobResult.duplicate ? undefined : new Date(),
        },
      }),
    );

    // Side effects
    await this.handleSideEffects(orgId, run, stepDef, lead);

    // Advance run
    await this.advanceRun(orgId, run, steps);
  }

  private evaluateConditions(conditions: Condition[], lead: any): boolean {
    for (const cond of conditions) {
      switch (cond.key) {
        case 'LEAD_NOT_WON':
          if (lead.status === 'WON') return false;
          break;
        case 'LEAD_NOT_LOST':
          if (lead.status === 'LOST') return false;
          break;
        case 'LEAD_STATUS_IN': {
          const statuses = (cond.params as any)?.statuses ?? [];
          if (!statuses.includes(lead.status)) return false;
          break;
        }
        case 'HAS_VALID_PHONE':
          if (!lead.phone || !E164_RE.test(lead.phone)) return false;
          break;
        case 'HAS_VALID_EMAIL':
          if (!lead.email || !EMAIL_RE.test(lead.email)) return false;
          break;
      }
    }
    return true;
  }

  private async advanceRun(orgId: string, run: any, steps: any[]): Promise<void> {
    const nextIndex = run.nextStepIndex + 1;
    const nextStep = steps[nextIndex];

    if (!nextStep) {
      await withOrg(this.prisma, orgId, (tx) =>
        (tx as any).messageSequenceRun.update({
          where: { id: run.id },
          data: { status: 'COMPLETED', stoppedAt: new Date(), nextStepIndex: nextIndex, nextStepAt: null },
        }),
      );
      return;
    }

    const nextStepAt = new Date(new Date(run.startedAt).getTime() + nextStep.delayMinutes * 60_000);
    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequenceRun.update({
        where: { id: run.id },
        data: { nextStepIndex: nextIndex, nextStepAt },
      }),
    );
  }

  private async checkReply(orgId: string, leadId: string, since: Date): Promise<boolean> {
    const count = await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).leadActivity.count({
        where: {
          leadId,
          type: { in: ['WHATSAPP_INBOUND', 'CALL', 'NOTE'] },
          happenedAt: { gte: since },
        },
      }),
    );
    return Number(count) > 0;
  }

  private async handleSideEffects(orgId: string, run: any, stepDef: any, lead: any): Promise<void> {
    try {
      if (stepDef.createTaskJson) {
        const taskData = stepDef.createTaskJson as Record<string, unknown>;
        const dueAt = taskData.dueAfterMinutes
          ? new Date(Date.now() + Number(taskData.dueAfterMinutes) * 60_000)
          : null;
        await withOrg(this.prisma, orgId, (tx) =>
          (tx as any).task.create({
            data: {
              organizationId: orgId,
              leadId: run.leadId,
              title: String(taskData.title ?? `Suite séquence étape ${stepDef.orderIndex}`),
              status: 'OPEN',
              dueAt,
              assigneeUserId: taskData.assignee === 'OWNER' ? lead.ownerUserId : null,
              createdByUserId: run.createdByUserId,
            },
          }),
        );
      }
    } catch (e: any) {
      this.logger.warn('Side effect task creation failed', { runId: run.id, error: e.message?.slice(0, 200) });
    }
  }

  async failRun(orgId: string, runId: string, reason: string): Promise<void> {
    await withOrg(this.prisma, orgId, (tx) =>
      (tx as any).messageSequenceRun.update({
        where: { id: runId },
        data: { status: 'FAILED', stoppedAt: new Date(), nextStepAt: null },
      }),
    );
  }
}
