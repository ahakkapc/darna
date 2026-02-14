-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'DONE', 'CANCELED');
CREATE TYPE "TaskPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
CREATE TYPE "ReminderStatus" AS ENUM ('SCHEDULED', 'SENT', 'CANCELED');

-- Add ORG_TICK_TASKS to JobType
ALTER TYPE "JobType" ADD VALUE 'ORG_TICK_TASKS';

-- CreateTable tasks
CREATE TABLE "tasks" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "leadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "TaskStatus" NOT NULL DEFAULT 'OPEN',
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "assigneeUserId" UUID,
    "createdByUserId" UUID,
    "tagsJson" JSONB,
    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable task_reminders
CREATE TABLE "task_reminders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "remindAt" TIMESTAMP(3) NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'SCHEDULED',
    "sentAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "dedupeKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "task_reminders_pkey" PRIMARY KEY ("id")
);

-- Indexes tasks
CREATE INDEX "tasks_organizationId_idx" ON "tasks"("organizationId");
CREATE INDEX "tasks_organizationId_status_idx" ON "tasks"("organizationId", "status");
CREATE INDEX "tasks_organizationId_assigneeUserId_status_idx" ON "tasks"("organizationId", "assigneeUserId", "status");
CREATE INDEX "tasks_organizationId_dueAt_idx" ON "tasks"("organizationId", "dueAt");
CREATE INDEX "tasks_leadId_createdAt_idx" ON "tasks"("leadId", "createdAt");
CREATE INDEX "tasks_organizationId_recordStatus_idx" ON "tasks"("organizationId", "recordStatus");
CREATE INDEX "tasks_organizationId_updatedAt_idx" ON "tasks"("organizationId", "updatedAt");

-- Indexes task_reminders
CREATE INDEX "task_reminders_organizationId_remindAt_status_idx" ON "task_reminders"("organizationId", "remindAt", "status");
CREATE UNIQUE INDEX "task_reminders_organizationId_dedupeKey_key" ON "task_reminders"("organizationId", "dedupeKey");

-- FK tasks → leads
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK task_reminders → tasks
ALTER TABLE "task_reminders" ADD CONSTRAINT "task_reminders_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- RLS tasks
ALTER TABLE "tasks" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tasks" FORCE ROW LEVEL SECURITY;

CREATE POLICY tasks_tenant_select ON "tasks" FOR SELECT
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY tasks_tenant_insert ON "tasks" FOR INSERT
  WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY tasks_tenant_update ON "tasks" FOR UPDATE
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY tasks_tenant_delete ON "tasks" FOR DELETE
  USING ("organizationId"::text = current_setting('app.org_id', true));

-- RLS task_reminders
ALTER TABLE "task_reminders" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "task_reminders" FORCE ROW LEVEL SECURITY;

CREATE POLICY task_reminders_tenant_select ON "task_reminders" FOR SELECT
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY task_reminders_tenant_insert ON "task_reminders" FOR INSERT
  WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY task_reminders_tenant_update ON "task_reminders" FOR UPDATE
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY task_reminders_tenant_delete ON "task_reminders" FOR DELETE
  USING ("organizationId"::text = current_setting('app.org_id', true));

-- GRANT DML to darna_app
GRANT SELECT, INSERT, UPDATE, DELETE ON "tasks" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "task_reminders" TO darna_app;
