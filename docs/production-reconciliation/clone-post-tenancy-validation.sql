-- SUPERSEDED: legacy production reconciliation was abandoned on 2026-09-13.
-- Retained only as historical read-only evidence. Do not use as a release plan.
-- Ghars reconciliation: READ-ONLY validation for an ISOLATED CLONE only.
-- Prerequisite: the clone has reached the intended tenant-aware schema.
-- This file contains no DDL, DML, or migration-journal changes.

SELECT
  current_database() AS database_name,
  current_user AS database_user,
  now() AS observed_at;

-- Every intended tenant-bearing table must be represented with its intended
-- nullability. audit_logs and system_errors allow global/platform rows.
WITH expected(table_name, expected_nullable) AS (
  VALUES
    ('patients', 'NO'), ('implant_cases', 'NO'), ('implants', 'NO'),
    ('prosthetic_events', 'NO'), ('bone_graft_procedures', 'NO'),
    ('payments', 'NO'), ('case_charges', 'NO'), ('case_discounts', 'NO'),
    ('installment_plans', 'NO'), ('installments', 'NO'),
    ('followups', 'NO'), ('communications', 'NO'),
    ('whatsapp_templates', 'NO'), ('implant_system_options', 'NO'),
    ('lookup_options', 'NO'), ('application_settings', 'NO'),
    ('tenant_memberships', 'NO'), ('email_verification_tokens', 'NO'),
    ('tenant_owner_email_claims', 'NO'),
    ('tenant_activation_requests', 'NO'), ('audit_logs', 'YES'),
    ('system_errors', 'YES')
)
SELECT
  e.table_name,
  c.is_nullable,
  CASE
    WHEN c.column_name IS NULL THEN 'MISSING'
    WHEN c.is_nullable = e.expected_nullable THEN 'PASS'
    ELSE 'FAIL_NULLABILITY'
  END AS result
FROM expected e
LEFT JOIN information_schema.columns c
  ON c.table_schema = 'public'
 AND c.table_name = e.table_name
 AND c.column_name = 'tenant_id'
ORDER BY e.table_name;

-- Every result must be zero before tenant constraints are approved.
SELECT 'application_settings_null_tenant' AS check_name, count(*)::bigint AS failures FROM application_settings WHERE tenant_id IS NULL
UNION ALL SELECT 'bone_graft_procedures_null_tenant', count(*) FROM bone_graft_procedures WHERE tenant_id IS NULL
UNION ALL SELECT 'case_charges_null_tenant', count(*) FROM case_charges WHERE tenant_id IS NULL
UNION ALL SELECT 'case_discounts_null_tenant', count(*) FROM case_discounts WHERE tenant_id IS NULL
UNION ALL SELECT 'communications_null_tenant', count(*) FROM communications WHERE tenant_id IS NULL
UNION ALL SELECT 'followups_null_tenant', count(*) FROM followups WHERE tenant_id IS NULL
UNION ALL SELECT 'implant_cases_null_tenant', count(*) FROM implant_cases WHERE tenant_id IS NULL
UNION ALL SELECT 'implant_system_options_null_tenant', count(*) FROM implant_system_options WHERE tenant_id IS NULL
UNION ALL SELECT 'implants_null_tenant', count(*) FROM implants WHERE tenant_id IS NULL
UNION ALL SELECT 'installment_plans_null_tenant', count(*) FROM installment_plans WHERE tenant_id IS NULL
UNION ALL SELECT 'installments_null_tenant', count(*) FROM installments WHERE tenant_id IS NULL
UNION ALL SELECT 'lookup_options_null_tenant', count(*) FROM lookup_options WHERE tenant_id IS NULL
UNION ALL SELECT 'patients_null_tenant', count(*) FROM patients WHERE tenant_id IS NULL
UNION ALL SELECT 'payments_null_tenant', count(*) FROM payments WHERE tenant_id IS NULL
UNION ALL SELECT 'prosthetic_events_null_tenant', count(*) FROM prosthetic_events WHERE tenant_id IS NULL
UNION ALL SELECT 'whatsapp_templates_null_tenant', count(*) FROM whatsapp_templates WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_memberships_null_tenant', count(*) FROM tenant_memberships WHERE tenant_id IS NULL
UNION ALL SELECT 'email_verification_tokens_null_tenant', count(*) FROM email_verification_tokens WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_owner_email_claims_null_tenant', count(*) FROM tenant_owner_email_claims WHERE tenant_id IS NULL
UNION ALL SELECT 'tenant_activation_requests_null_tenant', count(*) FROM tenant_activation_requests WHERE tenant_id IS NULL
ORDER BY check_name;

-- Every tenant FK orphan count must be zero.
SELECT 'application_settings_tenant_orphans' AS check_name, count(*)::bigint AS failures FROM application_settings x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'audit_logs_tenant_orphans', count(*) FROM audit_logs x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE x.tenant_id IS NOT NULL AND t.id IS NULL
UNION ALL SELECT 'bone_graft_procedures_tenant_orphans', count(*) FROM bone_graft_procedures x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'case_charges_tenant_orphans', count(*) FROM case_charges x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'case_discounts_tenant_orphans', count(*) FROM case_discounts x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'communications_tenant_orphans', count(*) FROM communications x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'followups_tenant_orphans', count(*) FROM followups x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'implant_cases_tenant_orphans', count(*) FROM implant_cases x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'implant_system_options_tenant_orphans', count(*) FROM implant_system_options x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'implants_tenant_orphans', count(*) FROM implants x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'installment_plans_tenant_orphans', count(*) FROM installment_plans x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'installments_tenant_orphans', count(*) FROM installments x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'lookup_options_tenant_orphans', count(*) FROM lookup_options x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'patients_tenant_orphans', count(*) FROM patients x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'payments_tenant_orphans', count(*) FROM payments x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'prosthetic_events_tenant_orphans', count(*) FROM prosthetic_events x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'whatsapp_templates_tenant_orphans', count(*) FROM whatsapp_templates x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'tenant_memberships_tenant_orphans', count(*) FROM tenant_memberships x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'email_verification_tokens_tenant_orphans', count(*) FROM email_verification_tokens x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'tenant_owner_email_claims_tenant_orphans', count(*) FROM tenant_owner_email_claims x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'tenant_activation_requests_tenant_orphans', count(*) FROM tenant_activation_requests x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE t.id IS NULL
UNION ALL SELECT 'system_errors_tenant_orphans', count(*) FROM system_errors x LEFT JOIN tenants t ON t.id=x.tenant_id WHERE x.tenant_id IS NOT NULL AND t.id IS NULL
ORDER BY check_name;

-- Parent/child tenant ownership must agree. Every result must be zero.
SELECT 'implant_case_patient_tenant_mismatch' AS check_name, count(*)::bigint AS failures
FROM implant_cases c JOIN patients p ON p.id=c.patient_id WHERE c.tenant_id<>p.tenant_id
UNION ALL
SELECT 'implant_case_tenant_mismatch', count(*)
FROM implants i JOIN implant_cases c ON c.id=i.implant_case_id WHERE i.tenant_id<>c.tenant_id
UNION ALL
SELECT 'prosthetic_event_case_tenant_mismatch', count(*)
FROM prosthetic_events e JOIN implant_cases c ON c.id=e.implant_case_id WHERE e.tenant_id<>c.tenant_id
UNION ALL
SELECT 'prosthetic_event_implant_tenant_mismatch', count(*)
FROM prosthetic_events e JOIN implants i ON i.id=e.implant_id WHERE e.implant_id IS NOT NULL AND e.tenant_id<>i.tenant_id
UNION ALL
SELECT 'bone_graft_case_tenant_mismatch', count(*)
FROM bone_graft_procedures b JOIN implant_cases c ON c.id=b.implant_case_id WHERE b.tenant_id<>c.tenant_id
UNION ALL
SELECT 'bone_graft_implant_tenant_mismatch', count(*)
FROM bone_graft_procedures b JOIN implants i ON i.id=b.implant_id WHERE b.implant_id IS NOT NULL AND b.tenant_id<>i.tenant_id
UNION ALL
SELECT 'payment_case_tenant_mismatch', count(*)
FROM payments p JOIN implant_cases c ON c.id=p.implant_case_id WHERE p.tenant_id<>c.tenant_id
UNION ALL
SELECT 'payment_installment_tenant_mismatch', count(*)
FROM payments p JOIN installments i ON i.id=p.installment_id WHERE p.installment_id IS NOT NULL AND p.tenant_id<>i.tenant_id
UNION ALL
SELECT 'charge_case_tenant_mismatch', count(*)
FROM case_charges x JOIN implant_cases c ON c.id=x.implant_case_id WHERE x.tenant_id<>c.tenant_id
UNION ALL
SELECT 'discount_case_tenant_mismatch', count(*)
FROM case_discounts x JOIN implant_cases c ON c.id=x.implant_case_id WHERE x.tenant_id<>c.tenant_id
UNION ALL
SELECT 'installment_plan_case_tenant_mismatch', count(*)
FROM installment_plans p JOIN implant_cases c ON c.id=p.implant_case_id WHERE p.tenant_id<>c.tenant_id
UNION ALL
SELECT 'installment_plan_tenant_mismatch', count(*)
FROM installments i JOIN installment_plans p ON p.id=i.plan_id WHERE i.tenant_id<>p.tenant_id
UNION ALL
SELECT 'followup_patient_tenant_mismatch', count(*)
FROM followups f JOIN patients p ON p.id=f.patient_id WHERE f.tenant_id<>p.tenant_id
UNION ALL
SELECT 'followup_case_tenant_mismatch', count(*)
FROM followups f JOIN implant_cases c ON c.id=f.implant_case_id WHERE f.tenant_id<>c.tenant_id
UNION ALL
SELECT 'communication_patient_tenant_mismatch', count(*)
FROM communications x JOIN patients p ON p.id=x.patient_id WHERE x.tenant_id<>p.tenant_id
UNION ALL
SELECT 'communication_case_tenant_mismatch', count(*)
FROM communications x JOIN implant_cases c ON c.id=x.implant_case_id WHERE x.implant_case_id IS NOT NULL AND x.tenant_id<>c.tenant_id
UNION ALL
SELECT 'communication_template_tenant_mismatch', count(*)
FROM communications x JOIN whatsapp_templates w ON w.id=x.template_id WHERE x.template_id IS NOT NULL AND x.tenant_id<>w.tenant_id
ORDER BY check_name;

-- Tenant-scoped duplicate groups must all be zero.
SELECT 'application_settings_tenant_key' AS check_name, count(*)::bigint AS duplicate_groups
FROM (SELECT tenant_id,key FROM application_settings GROUP BY tenant_id,key HAVING count(*)>1) d
UNION ALL
SELECT 'patients_tenant_file_number', count(*)
FROM (SELECT tenant_id,file_number FROM patients GROUP BY tenant_id,file_number HAVING count(*)>1) d
UNION ALL
SELECT 'implant_system_tenant_name', count(*)
FROM (SELECT tenant_id,name FROM implant_system_options GROUP BY tenant_id,name HAVING count(*)>1) d
UNION ALL
SELECT 'lookup_tenant_category_value', count(*)
FROM (SELECT tenant_id,category,value FROM lookup_options GROUP BY tenant_id,category,value HAVING count(*)>1) d
UNION ALL
SELECT 'membership_tenant_user', count(*)
FROM (SELECT tenant_id,user_id FROM tenant_memberships GROUP BY tenant_id,user_id HAVING count(*)>1) d
ORDER BY check_name;

-- Baseline preservation. Compare these values to the readiness report.
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