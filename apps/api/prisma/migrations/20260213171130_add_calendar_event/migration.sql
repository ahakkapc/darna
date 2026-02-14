-- CreateEnum
CREATE TYPE "CalendarEventType" AS ENUM ('VISIT', 'SIGNING', 'CALL_SLOT', 'MEETING', 'OTHER');
CREATE TYPE "CalendarEventStatus" AS ENUM ('SCHEDULED', 'COMPLETED', 'CANCELED', 'NO_SHOW');
CREATE TYPE "CalendarVisibility" AS ENUM ('INTERNAL', 'MANAGER_ONLY');
CREATE TYPE "ExternalCalendarProvider" AS ENUM ('GOOGLE', 'OUTLOOK');

-- CreateTable calendar_events
CREATE TABLE "calendar_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,

    "recordStatus" "RecordStatus" NOT NULL DEFAULT 'ACTIVE',
    "deletedAt" TIMESTAMP(3),
    "deletedByUserId" TEXT,

    "type" "CalendarEventType" NOT NULL DEFAULT 'VISIT',
    "status" "CalendarEventStatus" NOT NULL DEFAULT 'SCHEDULED',
    "visibility" "CalendarVisibility" NOT NULL DEFAULT 'INTERNAL',

    "title" TEXT NOT NULL,
    "description" TEXT,

    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Africa/Algiers',

    "assigneeUserId" TEXT NOT NULL,
    "createdByUserId" TEXT,
    "updatedByUserId" TEXT,

    "leadId" TEXT,
    "listingId" UUID,
    "targetType" TEXT,
    "targetId" TEXT,

    "wilaya" TEXT,
    "commune" TEXT,
    "quartier" TEXT,
    "addressLine" TEXT,

    "resultNote" TEXT,
    "completedAt" TIMESTAMP(3),

    "cancelReason" TEXT,
    "canceledAt" TIMESTAMP(3),

    "externalProvider" "ExternalCalendarProvider",
    "externalEventId" TEXT,

    "autoTaskId" UUID,

    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "calendar_events_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE INDEX "calendar_events_organizationId_idx" ON "calendar_events"("organizationId");
CREATE INDEX "calendar_events_organizationId_assigneeUserId_startAt_idx" ON "calendar_events"("organizationId", "assigneeUserId", "startAt");
CREATE INDEX "calendar_events_organizationId_status_startAt_idx" ON "calendar_events"("organizationId", "status", "startAt");
CREATE INDEX "calendar_events_leadId_idx" ON "calendar_events"("leadId");
CREATE INDEX "calendar_events_autoTaskId_idx" ON "calendar_events"("autoTaskId");

-- FK calendar_events -> users (assignee)
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_assigneeUserId_fkey" FOREIGN KEY ("assigneeUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- FK calendar_events -> leads (optional)
ALTER TABLE "calendar_events" ADD CONSTRAINT "calendar_events_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RLS calendar_events
ALTER TABLE "calendar_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "calendar_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY calendar_events_tenant_select ON "calendar_events" FOR SELECT
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY calendar_events_tenant_insert ON "calendar_events" FOR INSERT
  WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY calendar_events_tenant_update ON "calendar_events" FOR UPDATE
  USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY calendar_events_tenant_delete ON "calendar_events" FOR DELETE
  USING ("organizationId"::text = current_setting('app.org_id', true));

-- GRANT to darna_app
GRANT SELECT, INSERT, UPDATE, DELETE ON "calendar_events" TO darna_app;
