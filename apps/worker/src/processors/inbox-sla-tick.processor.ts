import { PrismaClient } from '@prisma/client';
import { logger } from '../logger';

const DEFAULT_SLA_MINUTES = 30;
const DEFAULT_ESCALATION_MINUTES = 120;

export async function processInboxSlaTick(
  prisma: PrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  const organizationId = data.organizationId as string;
  if (!organizationId) {
    logger.warn('INBOX_SLA_TICK: missing organizationId');
    return;
  }

  const now = new Date();
  const slaThreshold = new Date(now.getTime() - DEFAULT_SLA_MINUTES * 60_000);
  const escalationThreshold = new Date(now.getTime() - DEFAULT_ESCALATION_MINUTES * 60_000);

  const slaBreachedCandidates = await prisma.inboxThread.findMany({
    where: {
      organizationId,
      status: { not: 'CLOSED' },
      unreplied: true,
      unrepliedSince: { lte: slaThreshold },
      slaBreachedAt: null,
    },
    take: 50,
  }) as any[];

  let notifsSent = 0;
  let tasksSent = 0;

  for (const thread of slaBreachedCandidates) {
    // Mark SLA breached
    await prisma.inboxThread.update({
      where: { id: thread.id },
      data: { slaBreachedAt: now },
    });

    // Notification to assigned user or managers
    const targetUserIds: string[] = [];
    if (thread.assignedToUserId) {
      targetUserIds.push(thread.assignedToUserId);
    } else {
      const managers = await prisma.orgMembership.findMany({
        where: { orgId: organizationId, role: { in: ['OWNER', 'MANAGER'] } },
        select: { userId: true },
      });
      targetUserIds.push(...managers.map((m) => m.userId));
    }

    if (targetUserIds.length > 0) {
      // Create notification directly via DB (worker doesn't have NestJS DI)
      for (const userId of targetUserIds) {
        try {
          await prisma.notification.create({
            data: {
              organizationId,
              userId,
              category: 'INBOX',
              priority: 'URGENT',
              templateKey: 'inbox.sla.breached',
              title: 'SLA dépassé sur un fil de discussion',
              body: `Thread ${thread.displayName ?? 'Unknown'} sans réponse depuis ${DEFAULT_SLA_MINUTES} min`,
              linkUrl: `/app/inbox?threadId=${thread.id}`,
              dedupeKey: `inbox.sla:${thread.id}`,
              dedupeWindowSec: 3600,
            },
          });
          notifsSent++;
        } catch (e: any) {
          if (e?.code !== 'P2002') {
            logger.warn('SLA notification creation failed', { error: e.message });
          }
        }
      }

      // Create task if thread is linked to a lead
      if (thread.leadId) {
        try {
          const assignee = thread.assignedToUserId ?? targetUserIds[0];
          await prisma.task.create({
            data: {
              organizationId,
              leadId: thread.leadId,
              title: 'Répondre WhatsApp',
              description: `SLA breached: ${thread.displayName ?? 'Unknown'}`,
              priority: 'HIGH',
              dueAt: new Date(now.getTime() + 15 * 60_000),
              assigneeUserId: assignee,
              status: 'OPEN',
            },
          });
          tasksSent++;
        } catch (e: any) {
          logger.warn('SLA task creation failed', { error: e.message });
        }
      }
    }
  }

  // Escalation: threads that breached long ago
  const escalationCandidates = await prisma.inboxThread.findMany({
    where: {
      organizationId,
      status: { not: 'CLOSED' },
      unreplied: true,
      unrepliedSince: { lte: escalationThreshold },
      slaEscalatedAt: null,
    },
    take: 50,
  }) as any[];

  for (const thread of escalationCandidates) {
    await prisma.inboxThread.update({
      where: { id: thread.id },
      data: { slaEscalatedAt: now },
    });

    const managers = await prisma.orgMembership.findMany({
      where: { orgId: organizationId, role: { in: ['OWNER', 'MANAGER'] } },
      select: { userId: true },
    });

    for (const m of managers) {
      try {
        await prisma.notification.create({
          data: {
            organizationId,
            userId: m.userId,
            category: 'INBOX',
            priority: 'URGENT',
            templateKey: 'inbox.sla.breached',
            title: 'Escalade SLA — Thread non répondu',
            body: `Thread ${thread.displayName ?? 'Unknown'} sans réponse depuis ${DEFAULT_ESCALATION_MINUTES} min`,
            linkUrl: `/app/inbox?threadId=${thread.id}`,
            dedupeKey: `inbox.escalation:${thread.id}:${new Date().toISOString().slice(0, 10)}`,
            dedupeWindowSec: 86400,
          },
        });
      } catch (e: any) {
        if (e?.code !== 'P2002') {
          logger.warn('Escalation notification failed', { error: e.message });
        }
      }
    }
  }

  logger.info('INBOX_SLA_TICK completed', {
    organizationId,
    breached: slaBreachedCandidates.length,
    escalated: escalationCandidates.length,
    notifsSent,
    tasksSent,
  });
}
