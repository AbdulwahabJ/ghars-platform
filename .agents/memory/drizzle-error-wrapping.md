---
name: Drizzle wraps driver errors
description: Detecting Postgres SQLSTATE errors (e.g. 23505) requires walking the cause chain
---

# Drizzle wraps pg driver errors

**Rule:** When catching database constraint errors thrown through Drizzle ORM, do not check `err.code` on the top-level error only — Drizzle wraps the pg driver error (e.g. `DrizzleQueryError`), so walk the `cause` chain looking for the SQLSTATE code.

**Why:** A concurrency regression test caught a 500 where a 409 was expected: the unique-violation catch checked `err.code === "23505"` but the code lived on `err.cause`. Pre-check-then-insert paths masked the bug in ordinary sequential testing; only true parallel requests exposed it.

**How to apply:** Any new route that maps SQLSTATE codes (unique violation, FK violation, serialization failure) to HTTP responses must use a cause-chain-walking detector, and should have a genuinely parallel (`Promise.all`) regression test, not just sequential duplicates.
