---
name: Legacy import availability
description: Release-safety rules for the globally disabled legacy importer.
---

Legacy Data Import remains fully implemented but is unavailable by default behind the global platform setting. Customer UI and every tenant importer API must fail closed when the setting is false or unreadable. Platform-super-admin access controls availability only; it does not grant access to tenant medical data.

**Why:** The importer must continue to be developed and tested without being exposed to customers before it is ready. A UI-only gate or a fail-open configuration error would expose unfinished medical-data operations.

**How to apply:** Route all importer operations through one server guard, keep the customer UI in a Coming Soon state, and make importer-success tests explicitly enable the flag. Never enable it automatically by environment, deployment, or migration.