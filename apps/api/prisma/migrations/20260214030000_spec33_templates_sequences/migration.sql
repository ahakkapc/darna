-- SPEC-33: Templates & Séquences

-- Enums
CREATE TYPE "MessageChannel" AS ENUM ('WHATSAPP', 'EMAIL');
CREATE TYPE "TemplateStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED');
CREATE TYPE "SequenceStatus" AS ENUM ('DRAFT', 'ACTIVE', 'PAUSED', 'ARCHIVED');
CREATE TYPE "SequenceRunStatus" AS ENUM ('RUNNING', 'COMPLETED', 'CANCELED', 'FAILED');
CREATE TYPE "SequenceStepStatus" AS ENUM ('PENDING', 'SCHEDULED', 'SENT', 'FAILED', 'SKIPPED', 'CANCELED');
CREATE TYPE "SequenceConditionKey" AS ENUM ('LEAD_NOT_WON', 'LEAD_NOT_LOST', 'LEAD_STATUS_IN', 'HAS_VALID_PHONE', 'HAS_VALID_EMAIL');

-- Extend JobType
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'SEQUENCE_TICK';

-- MessageTemplate
CREATE TABLE "message_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "status" "TemplateStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "subject" TEXT,
    "body" TEXT NOT NULL,
    "variablesJson" JSONB,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_templates_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_templates_org_channel_status" ON "message_templates"("organizationId", "channel", "status");

-- MessageSequence
CREATE TABLE "message_sequences" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "status" "SequenceStatus" NOT NULL DEFAULT 'DRAFT',
    "name" TEXT NOT NULL,
    "description" TEXT,
    "defaultStartDelayMinutes" INTEGER NOT NULL DEFAULT 0,
    "stopOnReply" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_sequences_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "message_sequences_org_status" ON "message_sequences"("organizationId", "status");

-- MessageSequenceStep
CREATE TABLE "message_sequence_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "channel" "MessageChannel" NOT NULL,
    "templateId" UUID NOT NULL,
    "delayMinutes" INTEGER NOT NULL,
    "conditionsJson" JSONB,
    "createTaskJson" JSONB,
    "notifyJson" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_sequence_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_sequence_steps_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "message_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "message_sequence_steps_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "message_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "message_sequence_steps_org_seq_order" ON "message_sequence_steps"("organizationId", "sequenceId", "orderIndex");
CREATE INDEX "message_sequence_steps_sequenceId" ON "message_sequence_steps"("sequenceId");

-- MessageSequenceRun
CREATE TABLE "message_sequence_runs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "sequenceId" UUID NOT NULL,
    "leadId" TEXT NOT NULL,
    "status" "SequenceRunStatus" NOT NULL DEFAULT 'RUNNING',
    "startedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "stoppedAt" TIMESTAMPTZ,
    "nextStepIndex" INTEGER NOT NULL DEFAULT 0,
    "nextStepAt" TIMESTAMPTZ,
    "contextJson" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_sequence_runs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_sequence_runs_sequenceId_fkey" FOREIGN KEY ("sequenceId") REFERENCES "message_sequences"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "message_sequence_runs_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "message_sequence_runs_org_seq_lead" ON "message_sequence_runs"("organizationId", "sequenceId", "leadId");
CREATE INDEX "message_sequence_runs_org_lead_status" ON "message_sequence_runs"("organizationId", "leadId", "status");
CREATE INDEX "message_sequence_runs_org_status_next" ON "message_sequence_runs"("organizationId", "status", "nextStepAt");

-- MessageSequenceRunStep
CREATE TABLE "message_sequence_run_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "stepId" UUID NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "status" "SequenceStepStatus" NOT NULL DEFAULT 'PENDING',
    "scheduledAt" TIMESTAMPTZ,
    "sentAt" TIMESTAMPTZ,
    "outboundJobId" UUID,
    "lastErrorCode" TEXT,
    "lastErrorMsg" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "message_sequence_run_steps_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "message_sequence_run_steps_runId_fkey" FOREIGN KEY ("runId") REFERENCES "message_sequence_runs"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "message_sequence_run_steps_org_run_order" ON "message_sequence_run_steps"("organizationId", "runId", "orderIndex");
CREATE INDEX "message_sequence_run_steps_runId" ON "message_sequence_run_steps"("runId");
CREATE INDEX "message_sequence_run_steps_outboundJobId" ON "message_sequence_run_steps"("outboundJobId");

-- RLS for all 5 tables
ALTER TABLE "message_templates" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_templates" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_templates_tenant_select" ON "message_templates" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_templates_tenant_insert" ON "message_templates" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_templates_tenant_update" ON "message_templates" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_templates_tenant_delete" ON "message_templates" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

ALTER TABLE "message_sequences" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_sequences" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_sequences_tenant_select" ON "message_sequences" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequences_tenant_insert" ON "message_sequences" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequences_tenant_update" ON "message_sequences" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequences_tenant_delete" ON "message_sequences" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

ALTER TABLE "message_sequence_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_sequence_steps" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_sequence_steps_tenant_select" ON "message_sequence_steps" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_steps_tenant_insert" ON "message_sequence_steps" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_steps_tenant_update" ON "message_sequence_steps" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_steps_tenant_delete" ON "message_sequence_steps" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

ALTER TABLE "message_sequence_runs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_sequence_runs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_sequence_runs_tenant_select" ON "message_sequence_runs" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_runs_tenant_insert" ON "message_sequence_runs" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_runs_tenant_update" ON "message_sequence_runs" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_runs_tenant_delete" ON "message_sequence_runs" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

ALTER TABLE "message_sequence_run_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "message_sequence_run_steps" FORCE ROW LEVEL SECURITY;
CREATE POLICY "message_sequence_run_steps_tenant_select" ON "message_sequence_run_steps" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_run_steps_tenant_insert" ON "message_sequence_run_steps" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_run_steps_tenant_update" ON "message_sequence_run_steps" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "message_sequence_run_steps_tenant_delete" ON "message_sequence_run_steps" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

-- GRANT to darna_app
GRANT SELECT, INSERT, UPDATE, DELETE ON "message_templates" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "message_sequences" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "message_sequence_steps" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "message_sequence_runs" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "message_sequence_run_steps" TO darna_app;
