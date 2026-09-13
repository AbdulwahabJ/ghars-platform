# Ghars Final Production Release Preflight

**Recorded:** 2026-09-13  
**Production database:** Old database removed; fresh database not yet created  
**Deployment type:** Autoscale  
**Custom domain:** `https://ghars.digitaltclinic.com`  
**Publish performed:** NO

## Executive decision

Ghars is ready for the owner to create the fresh Production database through
Replit Publish, provided the option to initialize Production with Development
data remains disabled.

This approves only the controlled first Publish that creates the fresh
Production database. Final public launch approval remains conditional on
first-admin setup, support-contact configuration, and the disposable production
smoke test described below.

## Empty database migration test

A real disposable PostgreSQL database was created on the Development database
cluster. No Production or existing Development database was modified.

The following completed successfully:

- sequential Drizzle migration from `0000` through `0024`;
- 25 migration rows matched all 25 local SQL SHA-256 hashes;
- 30 expected public tables and five enums were present;
- critical Ghars tenant, authentication, clinical, financial, session, lookup,
  template, and media schema checks passed;
- all 24 customer, clinical, financial, and application-data tables contained
  zero rows;
- only migration-defined system/reference bootstrap rows existed;
- no truncation, schema drift, or legacy reconciliation was required.

The disposable database was dropped with force and confirmed absent after the
test.

**EMPTY DB MIGRATION TEST: PASS**

## Production session store

The API does not use Express MemoryStore. It uses PostgreSQL through
`connect-pg-simple`, with the Drizzle-managed `sessions` table and
`createTableIfMissing: false`.

For Production:

- `SESSION_SECRET` is configured;
- the deployment target is Autoscale;
- the session table is created by the verified migration chain;
- cookies are HTTP-only and SameSite=Lax;
- cookies become Secure when `NODE_ENV=production`;
- `trust proxy` is set to one Replit proxy hop;
- session lifetime is rolling 12 hours.

This is suitable for multiple Autoscale instances and process restarts because
session state is stored in PostgreSQL rather than process memory.

**PRODUCTION SESSION STORE: PASS**

## Production file and media storage

Runtime Landing Page media uploads use Replit App Storage, not the local runtime
filesystem. The implementation uses:

- private object paths;
- signed upload URLs;
- content type and binary validation;
- exact size checks;
- generation pinning;
- immutable promotion to canonical paths;
- database ownership/path constraints.

The required App Storage configuration is present. Static Landing Page
screenshots, logos, fonts, and brand assets remain repository assets.

No other persistent server-generated file path was found. Patient and user
profile image data currently stored in PostgreSQL does not depend on ephemeral
filesystem storage.

**PRODUCTION FILE STORAGE: PASS**

## Support contacts and trial duration

Development Platform Settings contains configured WhatsApp, phone, and email
contact fields. Its trial duration was corrected from 84 to **72 hours** during
this preflight.

Development rows must not be copied to the fresh Production database.
Production-specific support environment fallbacks are not configured, so the
owner must enter the real Production values after first-admin setup:

1. Support WhatsApp — required for the commercial contact flow.
2. Support Phone — required for the commercial contact flow.
3. Support Email — configure if email support is offered.
4. Confirm Default Trial Hours = 72.

Do not invent or copy test contact details.

**SUPPORT CONTACTS: ACTION REQUIRED**

## Platform Super Admin setup

The first Production Platform Super Admin is created after the fresh database
exists:

1. Confirm `INITIAL_SETUP_KEY` remains configured in the Production secrets.
2. Open the published Ghars setup page.
3. Submit the setup key and the owner's initial admin credentials through the
   setup form, which calls `POST /api/auth/setup`.
4. Confirm the response creates the first Platform Admin.
5. Confirm `/api/auth/setup-status` reports setup complete.
6. Confirm a second setup attempt is unavailable/rejected.
7. Sign in with the new Platform Admin account.

The route is rate limited, uses timing-safe key comparison, rechecks the absence
of a Platform Admin inside the transaction, hashes the password, and atomically
creates the user, Platform Admin marker, and preferences.

Never place the setup key or initial password in source code, logs, screenshots,
chat, or this report.

**PLATFORM SUPER ADMIN SETUP: PASS**

## Production environment configuration

Only names and statuses are reported.

| Variable | Status | Requirement |
| --- | --- | --- |
| `DATABASE_URL` | PLATFORM-MANAGED | Required; provisioned with fresh Production DB |
| `PORT` | PLATFORM-MANAGED | Required at runtime |
| `NODE_ENV` | PLATFORM-MANAGED | Must be `production` for secure-cookie behavior |
| `SESSION_SECRET` | CONFIGURED | Required |
| `INITIAL_SETUP_KEY` | CONFIGURED | Required for first setup only |
| `PRIVATE_OBJECT_DIR` | CONFIGURED | Required for media operations |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | CONFIGURED | Platform-managed App Storage bucket |
| `PUBLIC_OBJECT_SEARCH_PATHS` | CONFIGURED | Platform-managed object search paths |
| `SUPPORT_WHATSAPP` | MISSING | Optional fallback; configure Platform Settings instead |
| `SUPPORT_PHONE` | MISSING | Optional fallback; configure Platform Settings instead |
| `SUPPORT_EMAIL` | MISSING | Optional fallback; configure Platform Settings instead |
| `APP_BASE_URL` | MISSING | Required if password-reset or verification emails are enabled |
| `RESEND_API_KEY` | MISSING | Not required unless email delivery is enabled |
| `RESEND_FROM` | MISSING | Not required unless email delivery is enabled |
| `APP_VERSION` | MISSING | Not required |
| `LOG_LEVEL` | MISSING | Not required; default logging applies |

If email delivery is enabled, configure `APP_BASE_URL` as the verified HTTPS
custom domain and configure `RESEND_API_KEY` and `RESEND_FROM` through the
appropriate secret/environment flow.

**PRODUCTION SECRETS: PASS FOR CURRENT NON-EMAIL FLOW; ACTION REQUIRED IF EMAIL IS ENABLED**

## Custom-domain compatibility

The application is compatible with `https://ghars.digitaltclinic.com`:

- the deployment already identifies this as the primary public HTTPS URL;
- frontend API requests use the same origin and include credentials;
- there is no required cross-origin CORS path;
- production cookies are Secure;
- one-hop proxy trust supports Replit forwarded HTTPS and client information;
- CSRF checks compare Origin/Referer host to the forwarded/served host;
- no hardcoded development origin is required for standard login/session flows.

For password-reset and verification email links, set `APP_BASE_URL` to the
custom HTTPS domain before enabling email delivery.

**CUSTOM DOMAIN CONFIG: PASS**

## Owner Publish steps

Replit documentation confirms the data-copy option must remain disabled.

1. Open the **Publishing** tool for the Ghars application.
2. Review the selected deployment and confirm the public domain is
   `https://ghars.digitaltclinic.com`.
3. Continue to the Production database setup/review step.
4. Find the option named **Set up your production database with your current
   development data**, or any equivalent copy/overwrite Development data option.
5. Keep that option **disabled/not selected**.
6. Confirm the database plan creates a new Production schema from the current
   Development schema and does not overwrite it with Development rows.
7. Review the schema plan. Stop if it proposes truncation, legacy restoration,
   or requires Development-data copy.
8. Publish manually.

Official reference:
https://docs.replit.com/features/data-and-storage/development-and-production

The agent did not open, confirm, or execute Publish.

**FRESH PRODUCTION CREATION PATH: READY**

## Required post-creation validation

Before final public launch:

1. verify all customer/clinical counts are zero;
2. create the first Platform Super Admin securely;
3. configure Production Platform Settings and confirm 72 trial hours;
4. create one disposable customer tenant;
5. verify registration, login, trial, 46 managed defaults, 10 implant systems,
   12 WhatsApp templates, clinical and finance flows, permanent activation,
   suspension/reactivation, and Platform Admin visibility;
6. use a second disposable tenant only if needed for isolation verification;
7. delete every disposable smoke tenant and its data;
8. reverify zero commercial tenants and zero customer/clinical/demo rows.

## Final flags

| Flag | Status |
| --- | --- |
| EMPTY DB MIGRATION TEST | **PASS** |
| PRODUCTION SESSION STORE | **PASS** |
| PRODUCTION FILE STORAGE | **PASS** |
| SUPPORT CONTACTS | **ACTION REQUIRED AFTER CREATION** |
| PLATFORM SUPER ADMIN SETUP | **PASS** |
| PRODUCTION SECRETS | **PASS FOR CURRENT FLOW / ACTION REQUIRED IF EMAIL ENABLED** |
| CUSTOM DOMAIN CONFIG | **PASS** |
| FRESH PRODUCTION CREATION PATH | **READY** |
| FULL TEST SUITE | **PASS — 246/246** |
| PRODUCTION BUILD | **PASS** |
| READY FOR OWNER TO CREATE FRESH PRODUCTION | **YES** |
| SAFE TO PUBLISH TO CREATE THE FRESH DATABASE | **YES — ONLY WITH DEVELOPMENT DATA COPY DISABLED** |
| SAFE FOR FINAL PUBLIC LAUNCH AFTER CREATION | **NO — POST-CREATION SETUP AND SMOKE VALIDATION REQUIRED** |

No Publish action was performed.