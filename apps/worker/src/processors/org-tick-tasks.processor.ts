import { PrismaClient } from '@prisma/client';
import { withOrg } from './tenancy';

export async function processOrgTickTasks(
  prisma: PrismaClient,
  data: Record<string, unknown>,
): Promise<void> {
  const orgId = data.organizationId as string;
  if (!orgId) throw new Error('Missing organizationId in ORG_TICK_TASKS payload');

  const now = new Date();
  let remindersSent = 0;
  let overduesSent = 0;

  // 1) Process due reminders
  const dueReminders = await withOrg(prisma, orgId, (tx) =>
    tx.taskReminder.findMany({
      where: { status: 'SCHEDULED', remindAt: { lte: now } },
      take: 100,
      include: {
        task: {
          select: {
            id: true, title: true, leadId: true,
            assigneeUserId: true, status: true, recordStatus: true,
          },
        },
      },
    }),
  ) as any[];

  for (const reminder of dueReminders) {
    // Skip if task is done/canceled/deleted
    if (
      reminder.task.recordStatus === 'DELETED' ||
      reminder.task.status === 'DONE' ||
      reminder.task.status === 'CANCELED'
    ) {
      await withOrg(prisma, orgId, (tx) =>
        tx.taskReminder.update({
          where: { id: reminder.id },
          data: { status: 'CANCELED', canceledAt: now },
        }),
      );
      continue;
    }

    if (reminder.task.assigneeUserId) {
      // Create notification directly in DB (worker doesn't have NestJS DI)
      await withOrg(prisma, orgId, (tx) =>
        tx.notification.create({
          data: {
            organizationId: orgId,
            userId: reminder.task.assigneeUserId,
            category: 'TASK',
            priority: 'HIGH',
            templateKey: 'task.reminder',
            title: 'Rappel : tâche à traiter',
            body: String(reminder.task.title).slice(0, 120),
            linkUrl: `/app/crm/tasks/${reminder.task.id}`,
            metaJson: {
              taskId: reminder.task.id,
              leadId: reminder.task.leadId,
            },
          },
        }),
      );
      remindersSent++;
    }

    await withOrg(prisma, orgId, (tx) =>
      tx.taskReminder.update({
        where: { id: reminder.id },
        data: { status: 'SENT', sentAt: now },
      }),
    );
  }

  // 2) Process overdue tasks
  const overdueTasks = await withOrg(prisma, orgId, (tx) =>
    tx.task.findMany({
      where: {
        recordStatus: 'ACTIVE',
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        dueAt: { lt: now },
        assigneeUserId: { not: null },
      },
      take: 100,
      select: { id: true, title: true, leadId: true, assigneeUserId: true, priority: true },
    }),
  ) as any[];

  const todayBucket = now.toISOString().split('T')[0];

  for (const task of overdueTasks) {
    if (!task.assigneeUserId) continue;

    // Check if we already sent an overdue notif today for this task+user
    const dedupeWindowStart = new Date(now.getTime() - 86400 * 1000);
    const existing = await withOrg(prisma, orgId, (tx) =>
      tx.notification.findFirst({
        where: {
          organizationId: orgId,
          userId: task.assigneeUserId,
          templateKey: 'task.overdue',
          createdAt: { gte: dedupeWindowStart },
          recordStatus: 'ACTIVE',
          metaJson: { path: ['taskId'], equals: task.id },
        },
      }),
    );

    if (existing) continue;

    await withOrg(prisma, orgId, (tx) =>
      tx.notification.create({
        data: {
          organizationId: orgId,
          userId: task.assigneeUserId,
          category: 'TASK',
          priority: 'URGENT',
          templateKey: 'task.overdue',
          title: 'Tâche en retard',
          body: String(task.title).slice(0, 120),
          linkUrl: `/app/crm/tasks/${task.id}`,
          metaJson: {
            taskId: task.id,
            leadId: task.leadId,
            dateBucketId: todayBucket,
          },
        },
      }),
    );
    overduesSent++;
  }

  console.log(`[ORG_TICK_TASKS] org=${orgId} reminders=${remindersSent} overdue=${overduesSent}`);
}
