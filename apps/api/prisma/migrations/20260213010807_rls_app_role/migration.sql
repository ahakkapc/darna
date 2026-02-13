-- SPEC-01: Create non-superuser application role for RLS enforcement.
-- Superusers bypass RLS, so we need a regular role for business queries.
-- withOrg() will SET LOCAL ROLE darna_app inside each transaction.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'darna_app') THEN
    CREATE ROLE darna_app NOLOGIN;
  END IF;
END
$$;

-- Grant usage on the public schema
GRANT USAGE ON SCHEMA public TO darna_app;

-- Grant DML on all current and future tables
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO darna_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO darna_app;

-- Grant usage on sequences (for serial/identity columns if any)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO darna_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO darna_app;