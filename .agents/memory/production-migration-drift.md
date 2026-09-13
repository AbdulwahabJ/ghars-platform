---
name: Production database replacement
description: The owner abandoned legacy reconciliation and approved a clean production database replacement through Replit's supported UI.
---

Do not reconcile the legacy production database or repair its Drizzle journal. The owner authorized deleting all development/test and production database data for a clean first release. Production must be replaced through Replit's supported Database UI, then provisioned from the current schema without copying development data.

**Why:** Existing data no longer needs preservation, but the agent's production access remains read-only. Replit's supported path is owner-operated removal of the production database followed by a later controlled Publish that provisions a fresh database.

**How to apply:** Never bypass read-only production access. Stop until the owner removes the production database in Database → production → Settings → Remove database. Then clean development demo/test rows, validate the canonical schema, bootstraps, storage, sessions, builds, and tests. Publish only from a non-destructive fresh-schema preview, never selecting development-data copy. Preserve source, migrations, Landing Page screenshots, and brand assets.