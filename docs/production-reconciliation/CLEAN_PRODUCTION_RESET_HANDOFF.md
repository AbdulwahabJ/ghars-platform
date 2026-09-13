# Ghars Clean Production Database Reset — Operator Handoff

**Recorded:** 2026-09-13  
**Status:** BLOCKED ON OWNER-OPERATED REPLIT DATABASE REMOVAL  
**Publishing:** PROHIBITED UNTIL THE CLEAN DATABASE PATH IS COMPLETED AND VALIDATED

## Superseded strategy

The production reconciliation plan is abandoned. Do not:

- reconcile or preserve the legacy production rows;
- repair the legacy Drizzle migration journal;
- run direct production SQL;
- copy development database data into production.

The owner explicitly authorized deletion of all existing development/test and
production database data. This authorization does not include source code,
migrations, Landing Page assets/screenshots, brand assets, or approved
architecture.

## Why execution stops here

Replit Agent has read-only production database access and cannot remove or reset
the production database. It must not bypass that restriction through application
routes, deployment hooks, startup scripts, credentials, or custom migrations.

Replit's supported user-operated replacement path is:

1. Open the **Database** tool in the Replit workspace.
2. Select the **production** database, not development.
3. Open **Settings**.
4. Select **Remove database**.
5. Review the destructive confirmation carefully and confirm removal.

Replit documentation states that a removed database has a 7-day soft-delete
period before permanent deletion. Treat the old production database as removed
from the release path immediately, but retain awareness of that recovery window.

Official reference:
https://docs.replit.com/features/data-and-storage/development-and-production

## Required operator confirmation

After completing the action, confirm:

- the removed database was the production database;
- the development database was not removed;
- no source or repository assets were deleted;
- the production database no longer appears as the active database for the
  existing deployment.

Do not click Publish yet.

## What happens after confirmation

Work may resume only after the operator confirms removal. The next controlled
stage is:

1. clean authorized development/test demo and smoke data with existing safe
   cleanup tooling;
2. verify the current canonical schema and migration journal in development;
3. verify secure Platform Super Admin bootstrap without exposing passwords;
4. verify default managed-list and WhatsApp-template bootstrap behavior;
5. verify production-safe session and durable file-storage architecture;
6. run the requested TypeScript, API, authentication, tenant-isolation,
   commercial-lifecycle, bootstrap, and production-build checks;
7. inspect the Replit Publish schema preview;
8. publish only when the preview creates a fresh schema without copying
   development data and without destructive or unexpected operations;
9. run the disposable smoke-tenant checks, remove all smoke tenants and their
   data, then verify zero commercial customers and zero clinical/demo rows.

During the future Publish flow, do not select any option that copies development
database data to production. Production must receive the current schema and only
required system/bootstrap configuration.

## Current release flags

| Flag | Status |
| --- | --- |
| OLD PRODUCTION DATA REMOVED | **FAIL — OPERATOR ACTION REQUIRED** |
| DEVELOPMENT TEST DATA CLEANED | **FAIL — NOT RUN** |
| DEMO DATA IN PRODUCTION | **FOUND — LEGACY DATABASE STILL ACTIVE** |
| FRESH PRODUCTION SCHEMA | **FAIL — NOT CREATED** |
| MIGRATION JOURNAL CURRENT | **FAIL — FRESH JOURNAL NOT CREATED** |
| DEFAULT LIST CATALOG | **FAIL — NOT VALIDATED** |
| DEFAULT WHATSAPP TEMPLATES | **FAIL — NOT VALIDATED** |
| PLATFORM SUPER ADMIN BOOTSTRAP | **FAIL — NOT VALIDATED** |
| NEW TENANT BOOTSTRAP | **FAIL — NOT VALIDATED** |
| TENANT ISOLATION | **FAIL — NOT VALIDATED FOR FRESH PRODUCTION** |
| COMMERCIAL LIFECYCLE | **FAIL — NOT VALIDATED FOR FRESH PRODUCTION** |
| PRODUCTION SESSION STORE | **BLOCKED — NOT RECHECKED** |
| PRODUCTION FILE STORAGE | **BLOCKED — NOT RECHECKED** |
| REPLIT PUBLISH VALIDATION | **FAIL — NOT RUN** |
| FULL TEST SUITE | **FAIL — NOT RUN** |
| PRODUCTION BUILD | **FAIL — NOT RUN** |
| SAFE TO REPUBLISH | **NO** |

No production write, database removal, development cleanup, bootstrap, smoke
tenant creation, account change, or Publish was performed while preparing this
handoff.