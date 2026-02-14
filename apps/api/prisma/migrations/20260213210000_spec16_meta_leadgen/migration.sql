-- SPEC-16: Meta Lead Ads

-- Enum
CREATE TYPE "LeadRoutingStrategy" AS ENUM ('ROUND_ROBIN', 'MANAGER_ASSIGN', 'NONE');

-- Add META_LEAD_ADS to LeadSourceType
ALTER TYPE "LeadSourceType" ADD VALUE 'META_LEAD_ADS';

-- Add META_LEADGEN_BACKFILL to JobType
ALTER TYPE "JobType" ADD VALUE 'META_LEADGEN_BACKFILL';

-- Patch Lead: add external provider fields
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "externalProvider" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "externalLeadId" TEXT;
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "sourceMetaJson" JSONB;
CREATE UNIQUE INDEX IF NOT EXISTS "leads_organizationId_externalProvider_externalLeadId_key"
  ON "leads"("organizationId", "externalProvider", "externalLeadId");

-- MetaLeadSource
CREATE TABLE "meta_lead_sources" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "integrationId" UUID NOT NULL,
    "pageId" TEXT NOT NULL,
    "pageName" TEXT,
    "formId" TEXT NOT NULL,
    "formName" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "routingStrategy" "LeadRoutingStrategy" NOT NULL DEFAULT 'ROUND_ROBIN',
    "defaultOwnerUserId" UUID,
    "fieldMappingJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "meta_lead_sources_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "meta_lead_sources_organizationId_pageId_formId_key" ON "meta_lead_sources"("organizationId", "pageId", "formId");
CREATE INDEX "meta_lead_sources_integrationId_idx" ON "meta_lead_sources"("integrationId");
CREATE INDEX "meta_lead_sources_organizationId_isActive_idx" ON "meta_lead_sources"("organizationId", "isActive");
ALTER TABLE "meta_lead_sources" ADD CONSTRAINT "meta_lead_sources_integrationId_fkey" FOREIGN KEY ("integrationId") REFERENCES "integrations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- OrgRoutingState
CREATE TABLE "org_routing_states" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "organizationId" UUID NOT NULL,
    "rrCursorUserId" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "org_routing_states_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "org_routing_states_organizationId_key" ON "org_routing_states"("organizationId");

-- RLS: meta_lead_sources
ALTER TABLE "meta_lead_sources" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "meta_lead_sources" FORCE ROW LEVEL SECURITY;
CREATE POLICY "meta_lead_sources_select" ON "meta_lead_sources" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "meta_lead_sources_insert" ON "meta_lead_sources" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "meta_lead_sources_update" ON "meta_lead_sources" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "meta_lead_sources_delete" ON "meta_lead_sources" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "meta_lead_sources" TO darna_app;

-- RLS: org_routing_states
ALTER TABLE "org_routing_states" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_routing_states" FORCE ROW LEVEL SECURITY;
CREATE POLICY "org_routing_states_select" ON "org_routing_states" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "org_routing_states_insert" ON "org_routing_states" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "org_routing_states_update" ON "org_routing_states" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY "org_routing_states_delete" ON "org_routing_states" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_routing_states" TO darna_app;
