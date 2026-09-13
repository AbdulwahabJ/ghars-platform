# Ghars Clean Pre-Production Readiness

**Recorded:** 2026-09-13  
**Production database:** Owner confirmed removed  
**Publishing:** NOT PERFORMED  
**Decision:** READY TO CREATE A FRESH PRODUCTION DATABASE — **YES**

## Development cleanup

All disposable clinical, financial, screenshot, smoke-tenant, tenant-user,
session, and audit-history data was removed from Development. The deterministic
batch `ghars-screenshot-2026-09-12-v1` was validated before cleanup. Its cleanup
tool was corrected to remove additional smoke rows inside the pinned screenshot
tenant without widening its environment/database/tenant guards. A second run
returned `already-clean`.

The two non-internal customer/demo tenants and their non-platform users were
removed. The canonical internal tenant and the two existing Platform Admin
identities were retained as required Development control-plane records.

### Final Development counts

| Entity | Count | Classification |
| --- | ---: | --- |
| Internal tenants | 1 | Required system record |
| Customer tenants | 0 | Clean |
| Users | 2 | Required Platform Admin identities |
| Platform Admin markers | 2 | Required control-plane records |
| Tenant memberships | 0 | Clean |
| Patients | 0 | Clean |
| Implant cases | 0 | Clean |
| Implants | 0 | Clean |
| Payments | 0 | Clean |
| Follow-ups | 0 | Clean |
| Communications | 0 | Clean |
| Case charges | 0 | Clean |
| Case discounts | 0 | Clean |
| Installment plans | 0 | Clean |
| Installments | 0 | Clean |
| Prosthetic events | 0 | Clean |
| Bone graft / surgical procedures | 0 | Clean |
| Sessions | 0 | Clean |
| Audit logs | 0 | Clean |
| Internal implant-system options | 10 | Required bootstrap/reference catalog |
| Internal managed lookup options | 46 | Required bootstrap/reference catalog |
| Internal WhatsApp templates | 6 | Existing internal configuration |
| Platform settings | 1 | Required global configuration |
| Application settings | 0 | No customer settings |

The screenshot tenant reference and `SS26-*` patient marker both return zero.
No repository image, Landing Page, logo, brand, migration, or application-source
asset was deleted.

## Current schema and migration journal

Development contains the current tenant-aware schema through migration `0024`.
All 25 checked-in migration files (`0000`–`0024`) have exact SHA-256 matches in
`drizzle.__drizzle_migrations`.

The missing Development record for `0016` was added only after verifying all of
its effects: `users.must_change_password`, `tenants.city`, the partial unique
contact-phone index, removal of platform-admin tenant memberships, and absence
of the retired pending-verification status.

Migration `0022` adds tenant/name uniqueness for WhatsApp templates. Migrations
`0023` and `0024` add and finalize immutable tenant-scoped bootstrap identities
for managed defaults. Applied migration files were not rewritten: `0023` was
restored byte-for-byte to its applied hash, and its later key correction was
moved to additive migration `0024`.

Verified schema areas:

- tenant-aware ownership columns, FKs, and indexes;
- current composite `application_settings` structure;
- tenant memberships and Platform Admin separation;
- implant-system and lookup-option architecture;
- tenant-scoped WhatsApp-template architecture;
- PostgreSQL-backed production session schema.

## New-tenant bootstrap

Registration now creates the following in one database transaction:

- customer tenant;
- first user and Tenant Admin membership;
- 72-hour trial;
- 10 implant-system defaults;
- 46 managed lookup defaults across all eight active categories;
- 12 tenant-neutral bilingual WhatsApp templates.

The managed categories include:

- `q_value`;
- `former_value`;
- `graft_value`;
- `procedure_tag`;
- `bone_graft_procedure_type`;
- `bone_graft_material`;
- `bone_graft_membrane`;
- `bone_graft_status`.

Every default has an immutable internal `bootstrap_key`. Tenant administrators
can rename, edit, deactivate, or remove exposed values without a later bootstrap
restoring or duplicating the original. Concurrent and repeated bootstrap calls
remain duplicate-free. The key is not exposed through tenant administration
DTOs.

The 12 WhatsApp templates cover appointment confirmation/reminders, implant,
bone-graft, sinus-lift, surgical and prosthetic follow-up, missed appointments,
rescheduling, and general communication. They:

- contain Arabic and English;
- use only `patientName`, `date`, and `time` placeholders;
- contain no tenant-, clinic-, doctor-, or financial-specific claims;
- do not send automatically;
- create no communication history.

Tests verify tenant scoping, edit/deactivation isolation, concurrent
idempotency, no clinical rows, and transaction rollback.

## Platform Super Admin bootstrap

The first production Platform Super Admin is created through the existing
`POST /api/auth/setup` bootstrap route after the fresh database exists.

The route:

- requires the production `INITIAL_SETUP_KEY` secret;
- compares the key using timing-safe logic;
- is rate limited;
- refuses setup when a Platform Admin already exists;
- rechecks inside a transaction;
- creates the user, Platform Admin marker, and preferences atomically;
- hashes the password and does not hardcode it in source.

The operator supplies the setup key and initial credentials securely. No key or
password was read, printed, logged, or stored in this report.

## Session and file-storage architecture

The selected deployment type is Autoscale. Sessions use PostgreSQL through
`connect-pg-simple`, not MemoryStore. Production cookies are secure, HTTP-only,
SameSite=Lax, and backed by the required `SESSION_SECRET`.

Landing media uploads use Replit App Storage with private paths, signed uploads,
generation pinning, content validation, immutable promotion, and database
ownership constraints. Static Landing Page screenshots and brand assets remain
in the repository.

## Verification evidence

- Workspace TypeScript: PASS
- Shared tests: 25 PASS
- Screenshot tooling tests: 8 PASS
- API/auth/tenant/commercial/bootstrap tests: 213 PASS
- Total automated tests: 246 PASS
- Production frontend build: PASS
- Production backend build: PASS
- Development API `/api/ready`: PASS
- Development frontend HTTP response: 200
- Architectural review: PASS

The frontend build reports a non-blocking bundle-size warning; it does not fail
the build.

## Final release flags

| Flag | Status |
| --- | --- |
| DEVELOPMENT DEMO DATA CLEANED | **PASS** |
| SCREENSHOT SEED REMOVED | **PASS** |
| LANDING ASSETS PRESERVED | **PASS** |
| CURRENT SCHEMA VALID | **PASS** |
| MIGRATION JOURNAL VALID | **PASS** |
| DEFAULT LIST CATALOG | **PASS** |
| DEFAULT WHATSAPP TEMPLATES | **PASS** |
| NEW TENANT BOOTSTRAP | **PASS** |
| PLATFORM SUPER ADMIN BOOTSTRAP | **PASS** |
| TENANT ISOLATION | **PASS** |
| FULL TEST SUITE | **PASS** |
| PRODUCTION BUILD | **PASS** |
| READY TO CREATE FRESH PRODUCTION DATABASE | **YES** |

No fresh production database was created and no Publish action was performed.