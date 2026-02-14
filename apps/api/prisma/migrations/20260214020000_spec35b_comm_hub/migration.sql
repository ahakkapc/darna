-- SPEC-35B: Communication Hub — CommEvent + Lead doNotContact patch

-- New enums
CREATE TYPE "CommChannel" AS ENUM ('WHATSAPP', 'EMAIL');
CREATE TYPE "CommDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "CommStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'READ', 'FAILED', 'SKIPPED');

-- Extend ActivityType
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_INBOUND';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'WHATSAPP_SENT';
ALTER TYPE "ActivityType" ADD VALUE IF NOT EXISTS 'OPT_OUT';

-- Extend JobType
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'COMM_BACKFILL_THREAD';

-- Patch Lead: doNotContact fields
ALTER TABLE "leads" ADD COLUMN "doNotContact" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "leads" ADD COLUMN "doNotContactChannelsJson" JSONB;
ALTER TABLE "leads" ADD COLUMN "doNotContactReason" TEXT;
ALTER TABLE "leads" ADD COLUMN "doNotContactAt" TIMESTAMPTZ;

-- CommEvent table
CREATE TABLE "comm_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "channel" "CommChannel" NOT NULL,
    "direction" "CommDirection" NOT NULL,
    "status" "CommStatus" NOT NULL,
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "leadId" TEXT NOT NULL,
    "inboundEventId" UUID,
    "outboundJobId" UUID,
    "inboxThreadId" UUID,
    "inboxMessageId" UUID,
    "providerMessageId" TEXT,
    "dedupeKey" TEXT,
    "preview" TEXT,
    "metaJson" JSONB,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "comm_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "comm_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Indexes
CREATE INDEX "comm_events_org_lead_occurred" ON "comm_events"("organizationId", "leadId", "occurredAt");
CREATE INDEX "comm_events_org_channel_occurred" ON "comm_events"("organizationId", "channel", "occurredAt");
CREATE UNIQUE INDEX "comm_events_org_channel_providerMsgId" ON "comm_events"("organizationId", "channel", "providerMessageId");
CREATE UNIQUE INDEX "comm_events_org_channel_dedupeKey" ON "comm_events"("organizationId", "channel", "dedupeKey");
CREATE INDEX "comm_events_outboundJobId" ON "comm_events"("outboundJobId");
CREATE INDEX "comm_events_inboundEventId" ON "comm_events"("inboundEventId");

-- RLS
ALTER TABLE "comm_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "comm_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "comm_events_tenant_select" ON "comm_events" FOR SELECT
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "comm_events_tenant_insert" ON "comm_events" FOR INSERT
  WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "comm_events_tenant_update" ON "comm_events" FOR UPDATE
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "comm_events_tenant_delete" ON "comm_events" FOR DELETE
  USING ("organizationId"::text = current_setting('app.org_id', true));

-- Grant to darna_app
GRANT SELECT, INSERT, UPDATE, DELETE ON "comm_events" TO darna_app;
