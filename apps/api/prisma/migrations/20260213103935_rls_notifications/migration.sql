-- RLS for SPEC-07B notifications

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_tenant ON notifications
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON notifications TO darna_app;

ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_preferences_tenant ON notification_preferences
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_preferences TO darna_app;

ALTER TABLE notification_dispatches ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_dispatches FORCE ROW LEVEL SECURITY;
CREATE POLICY notification_dispatches_tenant ON notification_dispatches
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);
GRANT SELECT, INSERT, UPDATE, DELETE ON notification_dispatches TO darna_app;