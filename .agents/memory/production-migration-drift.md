---
name: Production database lifecycle
description: Production was clean-created without development data and is now live with real trial users; preserve it and account for Replit schema-sync journal behavior.
---

Do not return to legacy production reconciliation or migration-journal repair. Production was clean-created and is now live with real trial users and potentially clinical data. Preserve all records and use only read-only investigation unless the supported Publish flow explicitly applies a reviewed schema change.

**Why:** Existing legacy data was intentionally discarded, but the replacement Production database is no longer empty. Replit's Publish schema synchronization can create a fully current Production schema without populating `drizzle.__drizzle_migrations`; a missing journal alone is not schema drift and must not be “repaired.”

**How to apply:** Never bypass read-only Production access, reset data, copy Development rows, or run migrations directly. Verify schema state through read-only structural checks; treat journal absence separately from drift. Future schema changes go only through the reviewed Replit Publish diff, with no overwrite-data option. Review generated statements independently from migration SQL: schema comparison may emit structural DDL while omitting migration-file DML backfills.