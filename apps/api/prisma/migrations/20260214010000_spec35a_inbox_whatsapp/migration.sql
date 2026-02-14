-- SPEC-35A: Inbox WhatsApp

-- Enums
CREATE TYPE "InboxChannel" AS ENUM ('WHATSAPP');
CREATE TYPE "ThreadStatus" AS ENUM ('OPEN', 'PENDING', 'CLOSED');
CREATE TYPE "InboxMessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');
CREATE TYPE "InboxMessageStatus" AS ENUM ('RECEIVED', 'QUEUED', 'SENT', 'DELIVERED', 'FAILED');
CREATE TYPE "LastMessageBy" AS ENUM ('CUSTOMER', 'AGENT');
CREATE TYPE "ThreadActivityType" AS ENUM ('ASSIGNED', 'UNASSIGNED', 'STATUS_CHANGED', 'LEAD_LINKED', 'LEAD_UNLINKED');

-- Add WHATSAPP_INBOX to LeadSourceType
ALTER TYPE "LeadSourceType" ADD VALUE IF NOT EXISTS 'WHATSAPP_INBOX';

-- Add INBOX_SLA_TICK to JobType
ALTER TYPE "JobType" ADD VALUE IF NOT EXISTS 'INBOX_SLA_TICK';

-- InboxThread
CREATE TABLE "inbox_threads" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "channel" "InboxChannel" NOT NULL DEFAULT 'WHATSAPP',
    "phoneHash" TEXT NOT NULL,
    "phoneE164" TEXT,
    "displayName" TEXT,
    "leadId" UUID,
    "listingId" UUID,
    "status" "ThreadStatus" NOT NULL DEFAULT 'OPEN',
    "assignedToUserId" UUID,
    "assignedAt" TIMESTAMPTZ,
    "lastMessageAt" TIMESTAMPTZ,
    "lastMessagePreview" TEXT,
    "lastMessageBy" "LastMessageBy",
    "unreadCount" INTEGER NOT NULL DEFAULT 0,
    "lastReadAt" TIMESTAMPTZ,
    "unreplied" BOOLEAN NOT NULL DEFAULT false,
    "unrepliedSince" TIMESTAMPTZ,
    "integrationId" UUID,
    "externalThreadKey" TEXT,
    "slaBreachedAt" TIMESTAMPTZ,
    "slaEscalatedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,
    CONSTRAINT "inbox_threads_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inbox_threads_org_status_last" ON "inbox_threads"("organizationId", "status", "lastMessageAt");
CREATE INDEX "inbox_threads_org_assigned_last" ON "inbox_threads"("organizationId", "assignedToUserId", "lastMessageAt");
CREATE INDEX "inbox_threads_org_phone" ON "inbox_threads"("organizationId", "phoneHash");
CREATE INDEX "inbox_threads_org_lead" ON "inbox_threads"("organizationId", "leadId");

-- InboxMessage
CREATE TABLE "inbox_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "direction" "InboxMessageDirection" NOT NULL,
    "status" "InboxMessageStatus" NOT NULL DEFAULT 'RECEIVED',
    "occurredAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "providerMessageId" TEXT,
    "externalKey" TEXT,
    "bodyText" TEXT,
    "mediaJson" JSONB,
    "metaJson" JSONB,
    "createdByUserId" UUID,
    "sentBySystem" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "inbox_messages_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inbox_messages_thread_occurred" ON "inbox_messages"("threadId", "occurredAt");
CREATE INDEX "inbox_messages_org_provider" ON "inbox_messages"("organizationId", "providerMessageId");
CREATE UNIQUE INDEX "inbox_messages_org_provider_unique" ON "inbox_messages"("organizationId", "providerMessageId");

ALTER TABLE "inbox_messages" ADD CONSTRAINT "inbox_messages_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "inbox_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- InboxThreadActivity
CREATE TABLE "inbox_thread_activities" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "threadId" UUID NOT NULL,
    "type" "ThreadActivityType" NOT NULL,
    "payloadJson" JSONB,
    "createdByUserId" UUID,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT "inbox_thread_activities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "inbox_thread_activities_thread" ON "inbox_thread_activities"("threadId", "createdAt");

-- RLS: inbox_threads
ALTER TABLE "inbox_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_threads" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_threads' AND policyname = 'inbox_threads_tenant_select') THEN
    CREATE POLICY inbox_threads_tenant_select ON "inbox_threads" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_threads' AND policyname = 'inbox_threads_tenant_insert') THEN
    CREATE POLICY inbox_threads_tenant_insert ON "inbox_threads" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_threads' AND policyname = 'inbox_threads_tenant_update') THEN
    CREATE POLICY inbox_threads_tenant_update ON "inbox_threads" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_threads' AND policyname = 'inbox_threads_tenant_delete') THEN
    CREATE POLICY inbox_threads_tenant_delete ON "inbox_threads" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "inbox_threads" TO darna_app;

-- RLS: inbox_messages
ALTER TABLE "inbox_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_messages" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_messages' AND policyname = 'inbox_messages_tenant_select') THEN
    CREATE POLICY inbox_messages_tenant_select ON "inbox_messages" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_messages' AND policyname = 'inbox_messages_tenant_insert') THEN
    CREATE POLICY inbox_messages_tenant_insert ON "inbox_messages" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_messages' AND policyname = 'inbox_messages_tenant_update') THEN
    CREATE POLICY inbox_messages_tenant_update ON "inbox_messages" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_messages' AND policyname = 'inbox_messages_tenant_delete') THEN
    CREATE POLICY inbox_messages_tenant_delete ON "inbox_messages" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "inbox_messages" TO darna_app;

-- RLS: inbox_thread_activities
ALTER TABLE "inbox_thread_activities" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "inbox_thread_activities" FORCE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_thread_activities' AND policyname = 'inbox_thread_activities_tenant_select') THEN
    CREATE POLICY inbox_thread_activities_tenant_select ON "inbox_thread_activities" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_thread_activities' AND policyname = 'inbox_thread_activities_tenant_insert') THEN
    CREATE POLICY inbox_thread_activities_tenant_insert ON "inbox_thread_activities" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_thread_activities' AND policyname = 'inbox_thread_activities_tenant_update') THEN
    CREATE POLICY inbox_thread_activities_tenant_update ON "inbox_thread_activities" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'inbox_thread_activities' AND policyname = 'inbox_thread_activities_tenant_delete') THEN
    CREATE POLICY inbox_thread_activities_tenant_delete ON "inbox_thread_activities" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
  END IF;
END $$;

GRANT SELECT, INSERT, UPDATE, DELETE ON "inbox_thread_activities" TO darna_app;
