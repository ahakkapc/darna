-- RLS for SPEC-07A lead_activities

ALTER TABLE lead_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_activities FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_activities_tenant ON lead_activities
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);

-- Grants for darna_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON lead_activities TO darna_app;