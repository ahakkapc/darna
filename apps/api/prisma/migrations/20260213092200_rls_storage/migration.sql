-- RLS for SPEC-04 storage tables

ALTER TABLE file_blobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE file_blobs FORCE ROW LEVEL SECURITY;
CREATE POLICY file_blobs_tenant ON file_blobs
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents FORCE ROW LEVEL SECURITY;
CREATE POLICY documents_tenant ON documents
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);

ALTER TABLE document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_versions FORCE ROW LEVEL SECURITY;
CREATE POLICY document_versions_tenant ON document_versions
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);

ALTER TABLE document_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE document_links FORCE ROW LEVEL SECURITY;
CREATE POLICY document_links_tenant ON document_links
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);

ALTER TABLE upload_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE upload_sessions FORCE ROW LEVEL SECURITY;
CREATE POLICY upload_sessions_tenant ON upload_sessions
  USING ("organizationId" = current_setting('app.org_id', true)::uuid)
  WITH CHECK ("organizationId" = current_setting('app.org_id', true)::uuid);

-- Grants for darna_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON file_blobs TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON documents TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_versions TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON document_links TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON upload_sessions TO darna_app;
