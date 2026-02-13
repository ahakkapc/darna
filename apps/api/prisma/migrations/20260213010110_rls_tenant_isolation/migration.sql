-- SPEC-01: RLS tenant isolation (technical SQL — allowed per policy)

-- Enable RLS on tenant-scoped tables
ALTER TABLE "leads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "leads" FORCE ROW LEVEL SECURITY;

-- SELECT: only rows matching current org context
CREATE POLICY lead_tenant_isolation_select
  ON "leads"
  FOR SELECT
  USING ("orgId"::text = current_setting('app.org_id', true));

-- INSERT: only allow inserting rows for current org context
CREATE POLICY lead_tenant_isolation_insert
  ON "leads"
  FOR INSERT
  WITH CHECK ("orgId"::text = current_setting('app.org_id', true));

-- UPDATE: only rows matching current org context
CREATE POLICY lead_tenant_isolation_update
  ON "leads"
  FOR UPDATE
  USING ("orgId"::text = current_setting('app.org_id', true));

-- DELETE: only rows matching current org context
CREATE POLICY lead_tenant_isolation_delete
  ON "leads"
  FOR DELETE
  USING ("orgId"::text = current_setting('app.org_id', true));