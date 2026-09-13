# Ghars production database reconciliation readiness

## Decision

**STOP. No production write is authorized or safe from the current agent environment.**

This package records the read-only production inventory and the operator gates required before any reconciliation. It deliberately contains no production DDL or journal-repair statements.

Replit's supported production database interface gives the agent read-only access. Replit also prohibits adding a custom production migration script, deployment hook, or application-startup DDL. The only supported automatic schema path is Publish, and Publish is currently blocked because its development-to-production diff is destructive.

Inventory captured: **2026-09-13 (Asia/Riyadh)**  
Logical environment: **Replit production database for the Ghars deployment**  
Published application identity: **ghars.digitaltclinic.com**

## Mandatory gates

| Gate | Current result | Required evidence before proceeding |
|---|---|---|
| Supported production remediation path | BLOCKED | Escalate the drift evidence to Replit and obtain an explicitly supported remediation workflow. Do not use direct SQL or manually alter the journal. |
| Restorable backup | BLOCKED | Record the point-in-time restore point or scheduled-backup timestamp, production database identity, retention window, and tested recovery procedure. |
| Production-like dry run | NOT RUN | Restore/clone the current production shape into an isolated environment and run the approved reconciliation there first. |
| Reconciliation design review | NOT RUN | Review and test the forward-only, data-preserving design on an isolated non-production clone only. |
| Publish/schema validation | FAIL | The previously observed Publish diff proposes destructive convergence/truncation. Do not publish. |

Replit documents point-in-time restore for production databases and optional daily scheduled backups. Availability and retention depend on the plan. A backup is not considered confirmed merely because the feature exists; an actual restore point and recovery path must be recorded.

## Authoritative production inventory

The migration journal contains exactly six rows. Their hashes match local migrations `0000` through `0005` exactly. No journal entry exists for `0006` or later.

The actual schema, not the journal, shows that several later effects already exist:

| Migration | Classification | Production evidence |
|---|---|---|
| `0006_users_avatar` | PRESENT | `users.avatar_data text NULL` exists. |
| `0007_tough_valeria_richards` | PRESENT | `prosthetic_events` exists with the intended columns, PK, three FKs, and both date indexes. |
| `0008_strong_sebastian_shaw` | PRESENT | Both installment tables, checks, FKs, unique/index structures, and `payments.installment_id` exist. |
| `0009_bone_graft_procedures` | PARTIALLY PRESENT | Table, intended columns, PK, four FKs, and both indexes exist. The 11 baseline lookup rows under the four `bone_graft_*` categories are absent. Existing lookup data must not be overwritten. |
| `0010_calm_young_avengers` | PRESENT | `procedure_category`, `procedure_side`, `lift_type`, and the category index exist with the intended nullability/defaults. |
| `0011_ghars_password_reset` | MISSING | `users.email`, its lower-case unique index, and `password_reset_tokens` are absent. |
| `0012_ordinary_sir_ram` | MISSING | The `locale` enum and `user_preferences.locale` are absent. |
| `0013_free_demogoblin` | CONFLICTING | Production is still legacy single-tenant: no `tenants`, memberships, or `tenant_id` columns; `application_settings` still has PK `(key)`; global unique constraints remain. Applying final-state convergence directly would be destructive. |
| `0014_commercial_lifecycle` | MISSING | Commercial lifecycle tables/types are absent; blocked behind tenancy. |
| `0015_tenant_membership_authorization` | MISSING | Membership authority structures are absent; blocked behind tenancy. |
| `0016_commercial_auth_no_email` | MISSING | Dependent tenant/auth effects are absent. |
| `0017_platform_admin_control_center` | MISSING | Platform control tables and dependent columns are absent. |
| `0018_close_internal_activation_requests` | MISSING | Parent lifecycle structures are absent. |
| `0019_resolve_preferences_type_errors` | MISSING | `system_errors` is absent. |
| `0020_landing_media` | MISSING | `landing_media` and its bootstrap rows are absent. |
| `0021_landing_media_object_ownership` | MISSING | Parent table, object-path check, and unique object reference index are absent. |

### Existing production row counts

| Entity | Before | After |
|---|---:|---:|
| users | 3 | NOT RUN |
| patients | 12 | NOT RUN |
| implant cases | 11 | NOT RUN |
| implants | 8 | NOT RUN |
| payments | 10 | NOT RUN |
| follow-ups | 11 | NOT RUN |
| installment plans | 4 | NOT RUN |
| installments | 11 | NOT RUN |
| implant systems | 10 | NOT RUN |
| lookup/options | 35 | NOT RUN |
| application settings | 8 | NOT RUN |
| WhatsApp templates | 6 | NOT RUN |
| communications | 0 | NOT RUN |
| case charges | 0 | NOT RUN |
| case discounts | 0 | NOT RUN |
| prosthetic events | 2 | NOT RUN |
| bone graft procedures | 1 | NOT RUN |

### Existing integrity checks

The read-only checks returned zero for:

- implant cases without patients
- implants without implant cases
- payments without implant cases
- follow-ups without patients
- follow-ups without implant cases
- communications without patients
- duplicate application setting keys
- duplicate lookup `(category, value)` pairs
- duplicate implant system names

No `ghars-screenshot-2026-09-12-v1` marker was found in the checked users, patients, or follow-up fields. This proves only that the checked marker is absent; no development or screenshot records were copied during this audit.

### Existing configuration that must survive

- `application_settings`: 8 rows under the legacy primary key. All values must be preserved while moving to tenant scope.
- WhatsApp templates: 6 rows. Preserve all six and do not replace them with development templates.
- Implant system options: 10 active rows.
- Lookup options: 35 active rows across `former_value`, `graft_value`, `procedure_tag`, and `q_value`.
- ADMIN and all other user rows: preserve all 3 users; do not reset credentials or alter account state as part of schema reconciliation.

## Required safe escalation and clone-validation order

1. **Confirm backup**
   - Record an actual production restore point and retention window.
   - Record the production database identity and recovery procedure.
   - Test restore into an isolated environment where possible.
   - If this cannot be confirmed, stop.

2. **Create a production-like clone**
   - Start from the inventory and row counts in this report.
   - Do not seed development/demo records.
   - Confirm the clone has only migration journal entries `0000–0005` and the same mixed physical schema.

3. **Design and test already-present-effect handling on the clone**
   - Treat `0006`, `0007`, `0008`, and `0010` as verify-only.
   - For `0009`, preserve all custom lookup rows and add only genuinely missing baseline rows through the separately approved idempotent configuration bootstrap after schema health is established.
   - Do not blindly execute historical files `0006–0010`.

4. **Design and test missing pre-tenancy effects on the clone**
   - Reconcile `0011`, then `0012`.
   - Validate unique email and locale requirements before constraints.

5. **Design and test tenancy conversion on the clone**
   - Create/reuse the one canonical Internal/System tenant defined by system metadata.
   - Never identify or create it only by a display-name string.
   - Add each `tenant_id` as nullable.
   - Backfill ownership through existing relations first.
   - Assign only genuine legacy rows without a relational owner to the canonical system tenant.
   - Prove zero unresolved tenant IDs and zero orphans.
   - Add FKs, then `NOT NULL`, then tenant-scoped indexes/unique/PK constraints.
   - For `application_settings`, preserve all eight values, verify no duplicate `(tenant_id, key)`, then replace the legacy key structure.

6. **Design and test dependent migrations on the clone**
   - Reconcile `0014` through `0021` only after `0013` passes.
   - Validate parent tables, enums, uniqueness, and FK ownership before every constraint.

7. **Validate intended journal state on the clone**
   - Do not mark any migration applied before every intended schema and data effect is verified.
   - Use the exact local migration file hashes and journal timestamps.
   - Do not manually add production journal entries.
   - Never edit historical migration files or their hashes to conceal drift.

8. **Validate the production-like clone**
   - Run `production-readonly-audit.sql`.
   - Run `clone-post-tenancy-validation.sql` after the clone reaches the intended tenant-aware shape.
   - Compare every protected count to the baseline.
   - Require zero NULLs in tenant columns designated `NOT NULL`, zero invalid non-NULL tenant references in nullable columns, zero tenant-scoped duplicate keys, and zero ownership mismatches.
   - Confirm no demo marker or demo batch exists.
   - Start the application against the clone and run full TypeScript, API, auth, tenant-isolation, finance, commercial lifecycle, bootstrap, and production-build checks.
   - Assess locking, downtime, transaction boundaries, and rollback behavior for every proposed structural change.

9. **Escalate production remediation to Replit**
   - Provide this inventory, clone results, protected counts, and the destructive Publish diff to Replit.
   - Require an explicitly supported production remediation path.
   - Do not execute direct production SQL, manually repair the production journal, add deployment/startup DDL, or copy development data.

10. **Validate Publish without publishing**
    - Re-run Replit's schema comparison.
    - If any populated-table truncation or destructive convergence remains, `SAFE TO REPUBLISH` stays `NO`.

11. **Keep configuration bootstrap blocked**
    - Do not run managed-list or WhatsApp-template bootstrap against production until the schema is healthy through a supported path.
    - Any later supported bootstrap must add missing defaults only and must not overwrite customization, reactivate disabled defaults, duplicate rows, or send messages.

## Migration hash ledger

These hashes identify the current local migration files. They are evidence for later journal review, not authorization to insert journal rows.

| Migration | SHA-256 |
|---|---|
| 0006 | `bd0e42e1762750caf0e9cf267075d0346a7d87ddc29c035826c87b8d536f3239` |
| 0007 | `14242ec6ccf3657895196bedc851a598ebbd3f9892063a9efee23f7de2a4367b` |
| 0008 | `2b2877c0f23f6aacab982a149f36ac1021d48398739abc1b8d810ea06fc2595c` |
| 0009 | `a9928074f7def6cc79d089a2061397e19dd1c3a432bc6f967b5aba98a9b415a4` |
| 0010 | `5b0cca988c486315e7c807c3766a0036ecc2159a8372cff0b888b3707179b51e` |
| 0011 | `9c001012ec55aa8d3f53c59c4853cb68026fefcd8aeb780ca57cc49645d25012` |
| 0012 | `54609538b90a287232021cdefe71174b44444d2437f9523171f8504aa12d81ed` |
| 0013 | `21fdb5babbc0fabdb7e9b898e2fb3505c2d4d61064682a84ee512c82b1ce7f42` |
| 0014 | `efb3556d71e19d87b2f47b28dca9521c479095c6fe890fb8fa4b5c5a86233cee` |
| 0015 | `cf66b8a14be50239d22b44d82fd985314e3c614f09df31f34ac6862f2c2cc9e9` |
| 0016 | `8f6536558d0deaf4c84ff4b2d7db16e88898346d5beb337a7377e0e0afa0e910` |
| 0017 | `7c97f81ff54de830aaa87cb54a6aa0d7fe1f49883b3c3c02e3e3a977308f420d` |
| 0018 | `5886db7f8669a5f0ad1dfaad4db1464f6f9b698fb94c3ae47b4ff2bb2af2b887` |
| 0019 | `44323a823d22b7c5e67ee63895bc962522af53f39679a41b6e426a61dd670671` |
| 0020 | `3a6774fe9ce651ec36a5cd2902a9bea3935f7088843cc158bf9d9bbc131a1dc7` |
| 0021 | `c4a182983ac288ee1e15774a1a96eb06e283becf145f298aa9467511bb63eb10` |

## Current final flags

| Flag | Result |
|---|---|
| PRODUCTION BACKUP | **BLOCKED** |
| PRODUCTION SCHEMA DRIFT | **NOT RESOLVED** |
| PRODUCTION DATA PRESERVATION | **NOT RUN — baseline recorded only** |
| TENANT BACKFILL | **FAIL / NOT RUN** |
| APPLICATION_SETTINGS MIGRATION | **FAIL / NOT RUN** |
| MIGRATION JOURNAL | **FAIL / NOT REPAIRED** |
| NO DEMO DATA COPIED | **NOT PROVEN — no writes occurred and one known marker was checked** |
| DEFAULT LIST CATALOG | **NOT RUN** |
| DEFAULT WHATSAPP TEMPLATES | **NOT RUN** |
| REPLIT PUBLISH VALIDATION | **FAIL** |
| FULL TEST SUITE | **NOT RUN** |
| PRODUCTION BUILD | **NOT RUN** |
| SAFE TO REPUBLISH | **NO** |

## Stop condition

Do not publish, execute direct production DDL, manually repair the production journal, or run either default-data bootstrap. Production remediation remains blocked until an actual backup is confirmed, the design passes on a production-like clone, and Replit provides an explicitly supported path whose schema preview is non-destructive.