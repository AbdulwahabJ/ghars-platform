---
name: Legacy import safety invariants
description: Non-obvious integrity rules for extending Ghars staged legacy imports
---

**Rule:** Treat staged import data as server-owned. Recompute confidence, require exact header/value/row approvals, and never trust client-supplied review flags.

**Why:** A generic client mapping or stale patch can otherwise approve unrelated unknown columns or race a commit.

**How to apply:** Use versioned compare-and-set transitions for mapping, commit, pilot continuation, and rollback. Preserve tenant isolation for learned mappings and approvals.

**Rule:** A patient is the atomic import unit even when their history spans multiple source rows. Names must agree; differing non-empty phones conflict; one missing phone is compatible with the group's unique valid phone.

**Why:** Row-level transactions and first-row identity fields can split a history or silently discard identity data.

**How to apply:** Select and commit complete patient groups, derive canonical optional identity values across the compatible group, and block ambiguous combined fields for review.

**Rule:** Pilot imports remain resumable and rollback tracking is append-only across the whole batch.

**Why:** Finalizing after the first five patients, or overwriting created-record IDs, makes continued import and safe rollback unreliable.

**How to apply:** Track committed row numbers and immutable creation fingerprints; claim rollback before deletion and block it if any created record changed or gained references.