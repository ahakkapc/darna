-- SPEC-06 v2: CRM Leads overhaul

-- ============================================================
-- 1) New enums
-- ============================================================
CREATE TYPE "LeadType" AS ENUM ('BUYER', 'TENANT', 'SELLER', 'LANDLORD', 'INVESTOR');
CREATE TYPE "LeadSourceType" AS ENUM ('PLATFORM_CONTACT_FORM', 'PRICE_ESTIMATION', 'SAVED_SEARCH', 'SOCIAL_CAMPAIGN', 'MANUAL', 'IMPORT');
CREATE TYPE "LeadPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');
CREATE TYPE "LeadRelationType" AS ENUM ('LISTING', 'PROGRAM', 'LOT', 'OTHER');

-- ============================================================
-- 2) Rename LeadStatus enum values (safe — no drop/recreate)
-- ============================================================
ALTER TYPE "LeadStatus" RENAME VALUE 'CONTACTED' TO 'TO_CONTACT';
ALTER TYPE "LeadStatus" RENAME VALUE 'QUALIFIED' TO 'VISIT_SCHEDULED';
ALTER TYPE "LeadStatus" RENAME VALUE 'PROPOSAL' TO 'OFFER_IN_PROGRESS';

-- ============================================================
-- 3) Rename orgId → organizationId (preserve data + FK)
-- ============================================================
-- Drop old FK
ALTER TABLE "leads" DROP CONSTRAINT "leads_orgId_fkey";

-- Drop old indexes
DROP INDEX "leads_orgId_idx";
DROP INDEX "leads_orgId_status_idx";

-- Drop old RLS policies (they reference "orgId")
DROP POLICY IF EXISTS lead_tenant_isolation_select ON "leads";
DROP POLICY IF EXISTS lead_tenant_isolation_insert ON "leads";
DROP POLICY IF EXISTS lead_tenant_isolation_update ON "leads";
DROP POLICY IF EXISTS lead_tenant_isolation_delete ON "leads";

-- Rename the column
ALTER TABLE "leads" RENAME COLUMN "orgId" TO "organizationId";

-- Re-create FK with new column name
ALTER TABLE "leads" ADD CONSTRAINT "leads_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "orgs"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- 4) Add new columns to leads
-- ============================================================
ALTER TABLE "leads"
ADD COLUMN "type"            "LeadType"       NOT NULL DEFAULT 'BUYER',
ADD COLUMN "priority"        "LeadPriority"   NOT NULL DEFAULT 'MEDIUM',
ADD COLUMN "createdByUserId" TEXT,
ADD COLUMN "budgetMin"       INTEGER,
ADD COLUMN "budgetMax"       INTEGER,
ADD COLUMN "wilaya"          TEXT,
ADD COLUMN "commune"         TEXT,
ADD COLUMN "quartier"        TEXT,
ADD COLUMN "propertyType"    TEXT,
ADD COLUMN "surfaceMin"      INTEGER,
ADD COLUMN "notes"           TEXT,
ADD COLUMN "sourceType"      "LeadSourceType" NOT NULL DEFAULT 'MANUAL',
ADD COLUMN "sourceRefJson"   JSONB,
ADD COLUMN "tagsJson"        JSONB,
ADD COLUMN "lastContactAt"   TIMESTAMP(3),
ADD COLUMN "nextActionAt"    TIMESTAMP(3),
ADD COLUMN "lostReason"      TEXT,
ADD COLUMN "wonNote"         TEXT,
ADD COLUMN "recordStatus"    "RecordStatus"   NOT NULL DEFAULT 'ACTIVE',
ADD COLUMN "deletedAt"       TIMESTAMP(3),
ADD COLUMN "deletedByUserId" TEXT;

-- ============================================================
-- 5) New indexes on leads
-- ============================================================
CREATE INDEX "leads_organizationId_idx"           ON "leads"("organizationId");
CREATE INDEX "leads_organizationId_status_idx"    ON "leads"("organizationId", "status");
CREATE INDEX "leads_organizationId_ownerUserId_idx" ON "leads"("organizationId", "ownerUserId");
CREATE INDEX "leads_organizationId_type_idx"      ON "leads"("organizationId", "type");
CREATE INDEX "leads_organizationId_nextActionAt_idx" ON "leads"("organizationId", "nextActionAt");
CREATE INDEX "leads_organizationId_recordStatus_idx" ON "leads"("organizationId", "recordStatus");
CREATE INDEX "leads_organizationId_updatedAt_idx" ON "leads"("organizationId", "updatedAt");

-- ============================================================
-- 6) Re-create RLS policies for leads (using organizationId)
-- ============================================================
CREATE POLICY lead_tenant_isolation_select
  ON "leads" FOR SELECT
  USING ("organizationId"::text = current_setting('app.org_id', true));

CREATE POLICY lead_tenant_isolation_insert
  ON "leads" FOR INSERT
  WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));

CREATE POLICY lead_tenant_isolation_update
  ON "leads" FOR UPDATE
  USING ("organizationId"::text = current_setting('app.org_id', true));

CREATE POLICY lead_tenant_isolation_delete
  ON "leads" FOR DELETE
  USING ("organizationId"::text = current_setting('app.org_id', true));

-- ============================================================
-- 7) Create lead_relations table
-- ============================================================
CREATE TABLE "lead_relations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "relationType" "LeadRelationType" NOT NULL,
    "targetId" TEXT NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "lead_relations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "lead_relations_organizationId_idx" ON "lead_relations"("organizationId");
CREATE INDEX "lead_relations_leadId_idx" ON "lead_relations"("leadId");
CREATE INDEX "lead_relations_relationType_targetId_idx" ON "lead_relations"("relationType", "targetId");
CREATE UNIQUE INDEX "lead_relations_leadId_relationType_targetId_key" ON "lead_relations"("leadId", "relationType", "targetId");

ALTER TABLE "lead_relations" ADD CONSTRAINT "lead_relations_leadId_fkey"
  FOREIGN KEY ("leadId") REFERENCES "leads"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

-- ============================================================
-- 8) RLS for lead_relations
-- ============================================================
ALTER TABLE "lead_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "lead_relations" FORCE ROW LEVEL SECURITY;

CREATE POLICY lead_relation_tenant_select
  ON "lead_relations" FOR SELECT
  USING ("organizationId"::text = current_setting('app.org_id', true));

CREATE POLICY lead_relation_tenant_insert
  ON "lead_relations" FOR INSERT
  WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));

CREATE POLICY lead_relation_tenant_update
  ON "lead_relations" FOR UPDATE
  USING ("organizationId"::text = current_setting('app.org_id', true));

CREATE POLICY lead_relation_tenant_delete
  ON "lead_relations" FOR DELETE
  USING ("organizationId"::text = current_setting('app.org_id', true));

-- Grant DML to app role
GRANT SELECT, INSERT, UPDATE, DELETE ON "lead_relations" TO darna_app;
