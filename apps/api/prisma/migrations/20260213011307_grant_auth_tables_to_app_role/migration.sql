-- SPEC-02: Grant DML on auth tables to darna_app role
GRANT SELECT, INSERT, UPDATE, DELETE ON "users" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_memberships" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "refresh_tokens" TO darna_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON "org_invites" TO darna_app;