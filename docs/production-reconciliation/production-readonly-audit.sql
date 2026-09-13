-- Ghars production reconciliation: READ-ONLY validation only.
-- This file intentionally contains no DDL, DML, journal repair, or transaction.
-- Run against the intended database and confirm current_database()/current_user
-- before interpreting any result.

SELECT
  current_database() AS database_name,
  current_user AS database_user,
  current_setting('server_version') AS server_version,
  now() AS observed_at;

-- Current migration journal. Compare hashes to the readiness report.
SELECT id, hash, created_at
FROM drizzle.__drizzle_migrations
ORDER BY created_at, id;

-- Current tables.
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_type = 'BASE TABLE'
ORDER BY table_name;

-- Current columns, types, nullability, and defaults.
SELECT
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_schema = 'public'
ORDER BY table_name, ordinal_position;

-- Current constraints.
SELECT
  c.relname AS table_name,
  con.conname AS constraint_name,
  con.contype AS constraint_type,
  pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con
JOIN pg_class c ON c.oid = con.conrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
ORDER BY c.relname, con.conname;

-- Current indexes.
SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Current enums and values.
SELECT
  t.typname AS enum_name,
  e.enumsortorder,
  e.enumlabel
FROM pg_type t
JOIN pg_enum e ON e.enumtypid = t.oid
JOIN pg_namespace n ON n.oid = t.typnamespace
WHERE n.nspname = 'public'
ORDER BY t.typname, e.enumsortorder;

-- Protected baseline counts for the confirmed legacy production shape.
SELECT 'users' AS entity, count(*)::bigint AS count FROM users
UNION ALL SELECT 'patients', count(*) FROM patients
UNION ALL SELECT 'implant_cases', count(*) FROM implant_cases
UNION ALL SELECT 'implants', count(*) FROM implants
UNION ALL SELECT 'payments', count(*) FROM payments
UNION ALL SELECT 'followups', count(*) FROM followups
UNION ALL SELECT 'installment_plans', count(*) FROM installment_plans
UNION ALL SELECT 'installments', count(*) FROM installments
UNION ALL SELECT 'implant_system_options', count(*) FROM implant_system_options
UNION ALL SELECT 'lookup_options', count(*) FROM lookup_options
UNION ALL SELECT 'application_settings', count(*) FROM application_settings
UNION ALL SELECT 'whatsapp_templates', count(*) FROM whatsapp_templates
UNION ALL SELECT 'communications', count(*) FROM communications
UNION ALL SELECT 'case_charges', count(*) FROM case_charges
UNION ALL SELECT 'case_discounts', count(*) FROM case_discounts
UNION ALL SELECT 'prosthetic_events', count(*) FROM prosthetic_events
UNION ALL SELECT 'bone_graft_procedures', count(*) FROM bone_graft_procedures
ORDER BY entity;

-- Existing relational-integrity failures must all be zero.
SELECT 'implant_cases_without_patient' AS check_name, count(*)::bigint AS failures
FROM implant_cases c LEFT JOIN patients p ON p.id = c.patient_id
WHERE p.id IS NULL
UNION ALL
SELECT 'implants_without_case', count(*)
FROM implants i LEFT JOIN implant_cases c ON c.id = i.implant_case_id
WHERE c.id IS NULL
UNION ALL
SELECT 'payments_without_case', count(*)
FROM payments x LEFT JOIN implant_cases c ON c.id = x.implant_case_id
WHERE c.id IS NULL
UNION ALL
SELECT 'followups_without_patient', count(*)
FROM followups f LEFT JOIN patients p ON p.id = f.patient_id
WHERE p.id IS NULL
UNION ALL
SELECT 'followups_without_case', count(*)
FROM followups f LEFT JOIN implant_cases c ON c.id = f.implant_case_id
WHERE c.id IS NULL
UNION ALL
SELECT 'communications_without_patient', count(*)
FROM communications x LEFT JOIN patients p ON p.id = x.patient_id
WHERE p.id IS NULL
ORDER BY check_name;

-- Existing legacy-key duplicates must all be zero.
SELECT 'application_settings_key' AS check_name, count(*)::bigint AS duplicate_groups
FROM (
  SELECT key FROM application_settings GROUP BY key HAVING count(*) > 1
) d
UNION ALL
SELECT 'lookup_category_value', count(*)
FROM (
  SELECT category, value
  FROM lookup_options
  GROUP BY category, value
  HAVING count(*) > 1
) d
UNION ALL
SELECT 'implant_system_name', count(*)
FROM (
  SELECT name
  FROM implant_system_options
  GROUP BY name
  HAVING count(*) > 1
) d
ORDER BY check_name;

-- Configuration inventory. Values are deliberately not selected.
SELECT key, jsonb_typeof(value) AS value_type, updated_by IS NOT NULL AS has_updater
FROM application_settings
ORDER BY key;

SELECT
  'implant_system_options' AS source,
  NULL::text AS category,
  count(*)::bigint AS total,
  count(*) FILTER (WHERE is_active) AS active
FROM implant_system_options
UNION ALL
SELECT
  'lookup_options',
  category,
  count(*),
  count(*) FILTER (WHERE is_active)
FROM lookup_options
GROUP BY category
ORDER BY source, category NULLS FIRST;

-- Known screenshot/demo marker checks. All results must be zero.
SELECT 'users_demo_marker' AS check_name, count(*)::bigint AS matches
FROM users
WHERE username ILIKE '%ghars-screenshot-2026-09-12-v1%'
   OR coalesce(full_name, '') ILIKE '%ghars-screenshot-2026-09-12-v1%'
UNION ALL
SELECT 'patients_demo_marker', count(*)
FROM patients
WHERE coalesce(full_name, '') ILIKE '%ghars-screenshot-2026-09-12-v1%'
   OR coalesce(file_number, '') ILIKE '%ghars-screenshot-2026-09-12-v1%'
UNION ALL
SELECT 'followups_demo_marker', count(*)
FROM followups
WHERE coalesce(note, '') ILIKE '%ghars-screenshot-2026-09-12-v1%';

-- This catalog query records whether tenant columns exist in the current shape.
-- Run clone-post-tenancy-validation.sql only on an isolated clone after it has
-- reached the intended tenant-aware schema.
SELECT table_name, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name = 'tenant_id'
ORDER BY table_name;
