---
name: Production migration drift
description: Safety constraint for reconciling the legacy production database with the tenant-aware Ghars schema.
---

Do not Publish the tenant-aware schema while the production database is still in its legacy single-tenant shape. Replit Publish introspects the final development schema and does not execute the ordered Drizzle data migrations, so it cannot insert the canonical tenant and backfill populated rows before adding required tenant constraints.

**Why:** Production migration bookkeeping can lag behind the physical schema, while populated legacy clinical tables still need ordered, data-preserving DML. A direct schema diff can propose truncating those tables and can change the application-settings primary key before its tenant column exists.

**How to apply:** Keep historical migrations and their hashes unchanged. Require effect-level read-only verification, a verified backup, and an authorized production database operator to perform the ordered reconciliation and only then repair the migration ledger. Re-run schema diff and allow Publish only when it contains no truncation or structural-data-loss operations. Do not initialize or backfill tenant-managed default lists until schema reconciliation and production-data preservation have both passed; list defaults are a separate, later, idempotent configuration step and must never include development clinical/demo records.