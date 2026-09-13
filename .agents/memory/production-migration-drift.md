---
name: Production database replacement
description: The owner abandoned legacy reconciliation, removed the old production database, and approved a clean schema-only release without development data.
---

Do not return to legacy production reconciliation or journal repair. The owner removed the old production database and authorized a clean first release. The fresh production database must receive the current schema and required system bootstrap only, never development records.

**Why:** Existing legacy data was intentionally discarded. Development can contain test/control-plane state, so copying its data would reintroduce demo tenants, users, or clinical records into the clean release.

**How to apply:** Never bypass read-only production access. Before Publish, require clean Development, exact migration hashes, passing bootstraps/tests/builds, and a fresh-schema preview. Never select development-data copy. After creation, bootstrap the first Platform Super Admin through the guarded setup route and verify zero customer/clinical rows. Preserve source, migrations, Landing Page screenshots, and brand assets.