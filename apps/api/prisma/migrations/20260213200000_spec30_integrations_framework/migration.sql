-- SPEC-30: Integrations Framework

-- Enums
CREATE TYPE "IntegrationType" AS ENUM ('META_LEADGEN', 'WHATSAPP_PROVIDER', 'EMAIL_PROVIDER', 'EMAIL_INBOUND', 'GENERIC_WEBHOOK');
CREATE TYPE "IntegrationProvider" AS ENUM ('META_CLOUD', 'TWILIO', 'RESEND', 'SENDGRID', 'SMTP', 'GENERIC');
CREATE TYPE "IntegrationStatus" AS ENUM ('ACTIVE', 'DISABLED', 'ERROR');
CREATE TYPE "InboundEventSourceType" AS ENUM ('META_LEADGEN', 'WHATSAPP_INBOUND', 'EMAIL_INBOUND', 'GENERIC_WEBHOOK');
CREATE TYPE "InboundEventStatus" AS ENUM ('RECEIVED', 'PROCESSING', 'PROCESSED', 'ERROR', 'DEAD', 'DUPLICATE', 'IGNORED');
CREATE TYPE "OutboundJobType" AS ENUM ('WHATSAPP_MESSAGE', 'EMAIL_MESSAGE', 'GENERIC_HTTP_CALL');
CREATE TYPE "OutboundJobStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'FAILED', 'DEAD', 'CANCELED');

-- Add new job types
ALTER TYPE "JobType" ADD VALUE 'INBOUND_PROCESS_EVENT';
ALTER TYPE "JobType" ADD VALUE 'OUTBOUND_PROCESS_JOB';
ALTER TYPE "JobType" ADD VALUE 'INTEGRATION_HEALTHCHECK';

-- Integration
CREATE TABLE "integrations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "type" "IntegrationType" NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'ACTIVE',
    "name" TEXT NOT NULL,
    "configJson" JSONB,
    "healthJson" JSONB,
    "createdByUserId" UUID,
    "updatedByUserId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integrations_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integrations_organizationId_type_idx" ON "integrations"("organizationId", "type");
CREATE INDEX "integrations_organizationId_status_idx" ON "integrations"("organizationId", "status");

-- IntegrationSecret
CREATE TABLE "integration_secrets" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "key" TEXT NOT NULL,
    "valueEnc" TEXT NOT NULL,
    "keyVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "integration_secrets_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "integration_secrets_integrationId_idx" ON "integration_secrets"("integrationId");
CREATE UNIQUE INDEX "integration_secrets_organizationId_integrationId_key_key" ON "integration_secrets"("organizationId", "integrationId", "key");
ALTER TABLE "integration_secrets" ADD CONSTRAINT "integration_secrets_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- InboundEvent
CREATE TABLE "inbound_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "sourceType" "InboundEventSourceType" NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "integrationId" UUID,
    "externalId" TEXT,
    "dedupeKey" TEXT,
    "status" "InboundEventStatus" NOT NULL DEFAULT 'RECEIVED',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "payloadJson" JSONB,
    "metaJson" JSONB,
    "lastErrorCode" TEXT,
    "lastErrorMsg" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "inbound_events_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "inbound_events_organizationId_sourceType_receivedAt_idx" ON "inbound_events"("organizationId", "sourceType", "receivedAt");
CREATE INDEX "inbound_events_organizationId_status_nextAttemptAt_idx" ON "inbound_events"("organizationId", "status", "nextAttemptAt");
CREATE UNIQUE INDEX "inbound_events_organizationId_sourceType_externalId_key" ON "inbound_events"("organizationId", "sourceType", "externalId");
CREATE UNIQUE INDEX "inbound_events_organizationId_sourceType_dedupeKey_key" ON "inbound_events"("organizationId", "sourceType", "dedupeKey");

-- OutboundJob
CREATE TABLE "outbound_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "type" "OutboundJobType" NOT NULL,
    "provider" "IntegrationProvider" NOT NULL,
    "integrationId" UUID,
    "status" "OutboundJobStatus" NOT NULL DEFAULT 'PENDING',
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockedBy" TEXT,
    "dedupeKey" TEXT,
    "payloadJson" JSONB,
    "resultJson" JSONB,
    "lastErrorCode" TEXT,
    "lastErrorMsg" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "outbound_jobs_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "outbound_jobs_organizationId_status_nextAttemptAt_idx" ON "outbound_jobs"("organizationId", "status", "nextAttemptAt");
CREATE UNIQUE INDEX "outbound_jobs_organizationId_type_dedupeKey_key" ON "outbound_jobs"("organizationId", "type", "dedupeKey");

-- RLS: integrations
ALTER TABLE "integrations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integrations" FORCE ROW LEVEL SECURITY;
CREATE POLICY "integrations_select" ON "integrations" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "integrations_insert" ON "integrations" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "integrations_update" ON "integrations" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "integrations_delete" ON "integrations" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "integrations" TO darna_app;

-- RLS: integration_secrets
ALTER TABLE "integration_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "integration_secrets" FORCE ROW LEVEL SECURITY;
CREATE POLICY "integration_secrets_select" ON "integration_secrets" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "integration_secrets_insert" ON "integration_secrets" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "integration_secrets_update" ON "integration_secrets" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "integration_secrets_delete" ON "integration_secrets" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "integration_secrets" TO darna_app;

-- RLS: inbound_events
ALTER TABLE "inbound_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbound_events" FORCE ROW LEVEL SECURITY;
CREATE POLICY "inbound_events_select" ON "inbound_events" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "inbound_events_insert" ON "inbound_events" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "inbound_events_update" ON "inbound_events" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "inbound_events_delete" ON "inbound_events" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "inbound_events" TO darna_app;

-- RLS: outbound_jobs
ALTER TABLE "outbound_jobs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "outbound_jobs" FORCE ROW LEVEL SECURITY;
CREATE POLICY "outbound_jobs_select" ON "outbound_jobs" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "outbound_jobs_insert" ON "outbound_jobs" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "outbound_jobs_update" ON "outbound_jobs" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "outbound_jobs_delete" ON "outbound_jobs" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "outbound_jobs" TO darna_app;
