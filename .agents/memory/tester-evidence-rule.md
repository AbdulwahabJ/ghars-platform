---
name: Testing-agent evidence rule
description: Verify a tester's visual-failure claims against its screenshots before changing code
---

When the Playwright testing subagent reports a visual failure, view the cited screenshot with `viewImage` before attempting a fix. Testers sometimes read DOM text (which includes hidden elements), capture screenshots after the state closed, or run against a stale page that predates a hot reload.

**Why:** During the guided-tour fix, two "still broken" verdicts were based on a screenshot that showed the popover already closed and on stale-page runs — real fixes looked like failures.

**How to apply:** Require screenshots taken WHILE the disputed element is visible, ask for verification from rendered pixels (not DOM text), and instruct a hard reload before re-testing after frontend edits.

When a browser run is unable to launch because the environment is missing a native library, treat it as an infrastructure limitation, not an application verdict; pair the result with direct API checks and source-level route assertions.

**Why:** A later routing verification could not start Chromium because `libglib-2.0.so.0` was unavailable, while the authenticated API and platform-admin endpoints remained healthy.

**How to apply:** Separate browser availability from product correctness in the report, and do not change application code to compensate for a tester runtime failure.
