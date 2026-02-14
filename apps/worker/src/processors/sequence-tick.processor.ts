import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

async function withOrgWorker(prisma: PrismaClient, orgId: string, fn: (tx: any) => Promise<any>) {
  return prisma.$transaction(async (tx: any) => {
    await tx.$queryRawUnsafe(`SELECT set_config('app.org_id', $1, true)`, orgId);
    await tx.$executeRawUnsafe(`SET LOCAL ROLE darna_app`);
    const result = await fn(tx);
    await tx.$executeRawUnsafe(`RESET ROLE`);
    return result;
  });
}

const E164_RE = /^\+[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const VAR_REGEX = /\{\{(\w+)\}\}/g;

function renderTemplate(text: string, context: Record<string, string>): string {
  return text
    .replace(VAR_REGEX, (_m, v) => context[v] ?? '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildContext(lead: any, org: any, owner: any): Record<string, string> {
  const fullName = lead.fullName ?? '';
  return {
    leadFullName: fullName,
    leadFirstName: fullName.split(' ')[0] ?? '',
    leadPhone: lead.phone ?? '',
    leadEmail: lead.email ?? '',
    leadWilaya: lead.wilaya ?? '',
    leadCommune: lead.commune ?? '',
    agentName: owner?.name ?? '',
    companyName: org?.name ?? '',
    leadBudgetMin: lead.budgetMin != null ? String(lead.budgetMin) : '',
    leadBudgetMax: lead.budgetMax != null ? String(lead.budgetMax) : '',
    leadWantedType: lead.propertyType ?? '',
  };
}

function evaluateConditions(conditions: any[], lead: any): boolean {
  for (const cond of conditions) {
    switch (cond.key) {
      case 'LEAD_NOT_WON': if (lead.status === 'WON') return false; break;
      case 'LEAD_NOT_LOST': if (lead.status === 'LOST') return false; break;
      case 'LEAD_STATUS_IN': {
        const statuses = cond.params?.statuses ?? [];
        if (!statuses.includes(lead.status)) return false;
        break;
      }
      case 'HAS_VALID_PHONE': if (!lead.phone || !E164_RE.test(lead.phone)) return false; break;
      case 'HAS_VALID_EMAIL': if (!lead.email || !EMAIL_RE.test(lead.email)) return false; break;
    }
  }
  return true;
}

export async function processSequenceTick(prisma: PrismaClient): Promise<void> {
  const now = new Date();

  const runs: any[] = await prisma.messageSequenceRun.findMany({
    where: { status: 'RUNNING', nextStepAt: { lte: now } },
    take: 50,
    orderBy: { nextStepAt: 'asc' },
    include: {
      sequence: {
        include: { steps: { orderBy: { orderIndex: 'asc' }, include: { template: true } } },
      },
    },
  });

  logger.info('SEQUENCE_TICK', { eligibleRuns: runs.length });

  for (const run of runs) {
    try {
      await processOneRun(prisma, run);
    } catch (e: any) {
      logger.warn('SEQUENCE_TICK run error', { runId: run.id, error: e.message?.slice(0, 200) });
    }
  }
}

async function processOneRun(prisma: PrismaClient, run: any): Promise<void> {
  const orgId = run.organizationId;
  const seq = run.sequence;
  const steps = seq?.steps ?? [];

  if (run.status !== 'RUNNING') return;

  // stopOnReply check - use both CommEvent (inbound) and LeadActivity
  if (seq.stopOnReply) {
    // Check CommEvent for inbound communications (more reliable)
    const commInboundCount = await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.commEvent.count({
        where: {
          leadId: run.leadId,
          direction: 'INBOUND',
          occurredAt: { gte: run.startedAt },
        },
      }),
    );

    // Fallback: also check LeadActivity for calls and notes
    const activityReplyCount = await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.leadActivity.count({
        where: {
          leadId: run.leadId,
          type: { in: ['WHATSAPP_INBOUND', 'CALL'] },
          happenedAt: { gte: run.startedAt },
        },
      }),
    );

    if (Number(commInboundCount) > 0 || Number(activityReplyCount) > 0) {
      await withOrgWorker(prisma, orgId, (tx: any) =>
        tx.messageSequenceRun.update({
          where: { id: run.id },
          data: { status: 'CANCELED', stoppedAt: new Date(), nextStepAt: null },
        }),
      );
      logger.info('Run canceled: reply detected', { runId: run.id, commInboundCount, activityReplyCount });
      return;
    }
  }

  const stepDef = steps[run.nextStepIndex];
  if (!stepDef) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', stoppedAt: new Date(), nextStepAt: null },
      }),
    );
    return;
  }

  const lead: any = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.lead.findFirst({ where: { id: run.leadId } }),
  );
  if (!lead) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRun.update({
        where: { id: run.id },
        data: { status: 'FAILED', stoppedAt: new Date(), nextStepAt: null },
      }),
    );
    return;
  }

  // Opt-out enforcement: cancel sequence if lead has opted out
  if (lead.doNotContact) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRun.update({
        where: { id: run.id },
        data: { status: 'CANCELED', stoppedAt: new Date(), nextStepAt: null },
      }),
    );
    logger.info('Run canceled: lead opted out (doNotContact)', { runId: run.id, leadId: lead.id });
    return;
  }

  const org: any = await prisma.org.findUnique({ where: { id: orgId }, select: { name: true } });
  let owner: any = null;
  if (lead.ownerUserId) {
    owner = await prisma.user.findUnique({ where: { id: lead.ownerUserId }, select: { name: true } });
  }

  const conditions = Array.isArray(stepDef.conditionsJson) ? stepDef.conditionsJson : [];
  const conditionPassed = evaluateConditions(conditions, lead);

  const runStep: any = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.messageSequenceRunStep.create({
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
    await advanceRun(prisma, orgId, run, steps);
    return;
  }

  const template = stepDef.template;
  const context = buildContext(lead, org, owner);
  const renderedBody = renderTemplate(template.body, context);
  const renderedSubject = template.subject ? renderTemplate(template.subject, context) : undefined;

  const integrationType = stepDef.channel === 'WHATSAPP' ? 'WHATSAPP_PROVIDER' : 'EMAIL_PROVIDER';
  const integration: any = await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.integration.findFirst({
      where: { type: integrationType, status: 'ACTIVE' },
      select: { id: true, provider: true },
    }),
  );

  if (!integration) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRunStep.update({
        where: { id: runStep.id },
        data: { status: 'FAILED', lastErrorCode: 'PROVIDER_NOT_CONFIGURED' },
      }),
    );
    await advanceRun(prisma, orgId, run, steps);
    return;
  }

  const isWA = stepDef.channel === 'WHATSAPP';
  if (isWA && (!lead.phone || !E164_RE.test(lead.phone))) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRunStep.update({ where: { id: runStep.id }, data: { status: 'SKIPPED', lastErrorCode: 'NO_VALID_PHONE' } }),
    );
    await advanceRun(prisma, orgId, run, steps);
    return;
  }
  if (!isWA && (!lead.email || !EMAIL_RE.test(lead.email))) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRunStep.update({ where: { id: runStep.id }, data: { status: 'SKIPPED', lastErrorCode: 'NO_VALID_EMAIL' } }),
    );
    await advanceRun(prisma, orgId, run, steps);
    return;
  }

  const dedupeKey = `seq:${run.id}:step:${stepDef.orderIndex}`;
  const payload: Record<string, unknown> = isWA
    ? { toPhone: lead.phone, text: renderedBody, leadId: run.leadId, sequenceRunId: run.id, stepIndex: stepDef.orderIndex }
    : { toEmail: lead.email, subject: renderedSubject, body: renderedBody, leadId: run.leadId, sequenceRunId: run.id, stepIndex: stepDef.orderIndex };

  try {
    const job: any = await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.outboundJob.create({
        data: {
          organizationId: orgId,
          type: isWA ? 'WHATSAPP_MESSAGE' : 'EMAIL_MESSAGE',
          provider: integration.provider,
          integrationId: integration.id,
          dedupeKey,
          payloadJson: payload,
          status: 'PENDING',
        },
      }),
    );

    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRunStep.update({
        where: { id: runStep.id },
        data: { status: 'SENT', outboundJobId: job.id, sentAt: new Date() },
      }),
    );
  } catch (e: any) {
    if (e?.code === 'P2002') {
      logger.info('OutboundJob dedupe', { dedupeKey });
    } else {
      await withOrgWorker(prisma, orgId, (tx: any) =>
        tx.messageSequenceRunStep.update({
          where: { id: runStep.id },
          data: { status: 'FAILED', lastErrorCode: 'OUTBOUND_CREATE_FAILED', lastErrorMsg: e.message?.slice(0, 200) },
        }),
      );
    }
  }

  // Side effects (tasks)
  try {
    if (stepDef.createTaskJson) {
      const taskData = stepDef.createTaskJson as Record<string, unknown>;
      const dueAt = taskData.dueAfterMinutes
        ? new Date(Date.now() + Number(taskData.dueAfterMinutes) * 60_000)
        : null;
      await withOrgWorker(prisma, orgId, (tx: any) =>
        tx.task.create({
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
    logger.warn('Side effect task failed', { runId: run.id, error: e.message?.slice(0, 200) });
  }

  await advanceRun(prisma, orgId, run, steps);
}

async function advanceRun(prisma: PrismaClient, orgId: string, run: any, steps: any[]): Promise<void> {
  const nextIndex = run.nextStepIndex + 1;
  const nextStep = steps[nextIndex];

  if (!nextStep) {
    await withOrgWorker(prisma, orgId, (tx: any) =>
      tx.messageSequenceRun.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', stoppedAt: new Date(), nextStepIndex: nextIndex, nextStepAt: null },
      }),
    );
    return;
  }

  const nextStepAt = new Date(new Date(run.startedAt).getTime() + nextStep.delayMinutes * 60_000);
  await withOrgWorker(prisma, orgId, (tx: any) =>
    tx.messageSequenceRun.update({
      where: { id: run.id },
      data: { nextStepIndex: nextIndex, nextStepAt },
    }),
  );
}
