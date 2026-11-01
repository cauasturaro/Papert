-- setup-schemas.sql
-- Creates isolated schemas and service users for Core and Seymour.
-- Run as papert_admin via: make setup-db
-- Passwords are injected via psql variables: -v core_password=... -v seymour_password=...
-- Idempotent: safe to run more than once.

-- ── Core user and schema ───────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'core_user') THEN
    CREATE ROLE core_user LOGIN PASSWORD :'core_password';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS core AUTHORIZATION core_user;

-- Ensure core_user owns the schema even if it already existed
ALTER SCHEMA core OWNER TO core_user;

-- Grant usage on public (needed for the vector extension installed there)
GRANT USAGE ON SCHEMA public TO core_user;

-- Revoke access to seymour schema (defensive; schema may not exist yet)
DO $$
BEGIN
  IF EXISTS (SELECT FROM information_schema.schemata WHERE schema_name = 'seymour') THEN
    REVOKE ALL ON SCHEMA seymour FROM core_user;
  END IF;
END
$$;

-- ── Seymour user and schema ────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'seymour_user') THEN
    CREATE ROLE seymour_user LOGIN PASSWORD :'seymour_password';
  END IF;
END
$$;

CREATE SCHEMA IF NOT EXISTS seymour AUTHORIZATION seymour_user;

ALTER SCHEMA seymour OWNER TO seymour_user;

GRANT USAGE ON SCHEMA public TO seymour_user;

-- Revoke access to core schema from seymour_user
REVOKE ALL ON SCHEMA core FROM seymour_user;

-- Also ensure core_user cannot touch seymour now that seymour schema is guaranteed to exist
REVOKE ALL ON SCHEMA seymour FROM core_user;

-- ── Summary ───────────────────────────────────────────────────────────────────
\echo 'setup-schemas: core_user and seymour_user created; schemas isolated.'
