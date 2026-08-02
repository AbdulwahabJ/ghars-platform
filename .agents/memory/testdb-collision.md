---
name: Test-DB collision between vitest and tester sessions
description: The API unit-test suite truncates the shared test database; never run it while a browser-tester session is using that DB
---

# Shared test database is a single mutable resource

**Rule:** Do not run the api-server vitest suite while a testing subagent has the API workflow pointed at the test database (`dental_followup_test`). The vitest helpers TRUNCATE all tables at suite start, wiping the tester's seeded users/data mid-flow and producing confusing "row exists in UI but not in DB / login 401" false failures.

**Why:** During Phase 6 e2e verification the unit suite ran concurrently with a tester session; it truncated the test DB, deleted the tester's freshly created account, and the tester reported a phantom "user does not persist" app bug. Diagnosis required querying both DBs directly.

**How to apply:** Sequence them — finish the vitest run before dispatching a tester onto the test DB (or vice versa). If a tester reports data vanishing on the test DB, first check whether a unit-test run overlapped before treating it as an app bug. Also note tester "direct DB checks" may hit the wrong database; verify contested rows yourself with psql against the exact URL.
