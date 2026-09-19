---
name: Schema health fingerprints
description: How to distinguish real database drift from a stale expected fingerprint in the platform health check.
---

The schema health check compares the live database against an embedded expected fingerprint. If Production and Development return identical structural fingerprints but the health card reports drift, treat the embedded expected fingerprint as stale rather than migrating either database. Keep old migrations immutable: if a later migration adds columns, do not also add those columns to the earlier `CREATE TABLE`, because fresh databases then get different column ordinals from upgraded databases.

**Why:** A stale expected column signature produced a false Production warning even though table, column, constraint, and index counts and signatures matched between Development and Production. Retroactively duplicating later-added columns in an earlier migration also made fresh test databases structurally equivalent but fingerprint-different from upgraded Development.

**How to apply:** Compare both environments read-only first. Rebuild a fresh migration database and compare it with the upgraded development schema, including column order. Update the expected fingerprint and its fixture only when they agree; use Publish schema synchronization only when a real Production/Development difference exists.