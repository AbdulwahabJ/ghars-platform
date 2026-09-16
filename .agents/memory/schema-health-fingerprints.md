---
name: Schema health fingerprints
description: How to distinguish real database drift from a stale expected fingerprint in the platform health check.
---

The schema health check compares the live database against an embedded expected fingerprint. If Production and Development return identical structural fingerprints but the health card reports drift, treat the embedded expected fingerprint as stale rather than migrating either database.

**Why:** A stale expected column signature produced a false Production warning even though table, column, constraint, and index counts and signatures matched between Development and Production.

**How to apply:** Compare both environments read-only first. Update the expected fingerprint and its fixture only when both databases match the schema source of truth; use Publish schema synchronization only when a real Production/Development difference exists.