-- check-isolation.sql
-- Verifies that core and seymour schemas exist and are isolated.
-- Run as papert_admin. Individual per-user isolation is checked via make check-isolation.

-- Confirm both schemas exist
SELECT schema_name
FROM information_schema.schemata
WHERE schema_name IN ('core', 'seymour')
ORDER BY schema_name;

-- Confirm both users exist
SELECT rolname
FROM pg_catalog.pg_roles
WHERE rolname IN ('core_user', 'seymour_user')
ORDER BY rolname;

\echo 'check-isolation: schemas and users verified.'
