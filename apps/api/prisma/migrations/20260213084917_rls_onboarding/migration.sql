-- RLS for org_onboardings
ALTER TABLE "org_onboardings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "org_onboardings" FORCE ROW LEVEL SECURITY;
CREATE POLICY org_onboardings_select ON "org_onboardings" FOR SELECT USING ("orgId"::text = current_setting('app.org_id', true));
CREATE POLICY org_onboardings_insert ON "org_onboardings" FOR INSERT WITH CHECK ("orgId"::text = current_setting('app.org_id', true));
CREATE POLICY org_onboardings_update ON "org_onboardings" FOR UPDATE USING ("orgId"::text = current_setting('app.org_id', true));
CREATE POLICY org_onboardings_delete ON "org_onboardings" FOR DELETE USING ("orgId"::text = current_setting('app.org_id', true));

GRANT SELECT, INSERT, UPDATE, DELETE ON "org_onboardings" TO darna_app;