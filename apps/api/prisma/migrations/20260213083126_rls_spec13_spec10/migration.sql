-- RLS for kyc_requests
ALTER TABLE "kyc_requests" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "kyc_requests" FORCE ROW LEVEL SECURITY;
CREATE POLICY kyc_requests_select ON "kyc_requests" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY kyc_requests_insert ON "kyc_requests" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY kyc_requests_update ON "kyc_requests" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY kyc_requests_delete ON "kyc_requests" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

-- RLS for subscriptions
ALTER TABLE "subscriptions" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "subscriptions" FORCE ROW LEVEL SECURITY;
CREATE POLICY subscriptions_select ON "subscriptions" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY subscriptions_insert ON "subscriptions" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY subscriptions_update ON "subscriptions" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY subscriptions_delete ON "subscriptions" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

-- RLS for offline_payments
ALTER TABLE "offline_payments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "offline_payments" FORCE ROW LEVEL SECURITY;
CREATE POLICY offline_payments_select ON "offline_payments" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY offline_payments_insert ON "offline_payments" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY offline_payments_update ON "offline_payments" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY offline_payments_delete ON "offline_payments" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

-- RLS for listings
ALTER TABLE "listings" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listings" FORCE ROW LEVEL SECURITY;
CREATE POLICY listings_select ON "listings" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listings_insert ON "listings" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listings_update ON "listings" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listings_delete ON "listings" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

-- RLS for listing_moderations
ALTER TABLE "listing_moderations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_moderations" FORCE ROW LEVEL SECURITY;
CREATE POLICY listing_moderations_select ON "listing_moderations" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listing_moderations_insert ON "listing_moderations" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listing_moderations_update ON "listing_moderations" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listing_moderations_delete ON "listing_moderations" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));

-- RLS for listing_lead_relations
ALTER TABLE "listing_lead_relations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "listing_lead_relations" FORCE ROW LEVEL SECURITY;
CREATE POLICY listing_lead_relations_select ON "listing_lead_relations" FOR SELECT USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listing_lead_relations_insert ON "listing_lead_relations" FOR INSERT WITH CHECK ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listing_lead_relations_update ON "listing_lead_relations" FOR UPDATE USING ("organizationId"::text = current_setting('app.org_id', true));
CREATE POLICY listing_lead_relations_delete ON "listing_lead_relations" FOR DELETE USING ("organizationId"::text = current_setting('app.org_id', true));