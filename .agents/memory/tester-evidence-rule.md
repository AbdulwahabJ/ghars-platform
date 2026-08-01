---
name: Testing-agent evidence rule
description: Verify a tester's visual-failure claims against its screenshots before changing code
---

When the Playwright testing subagent reports a visual failure, view the cited screenshot with `viewImage` before attempting a fix. Testers sometimes read DOM text (which includes hidden elements), capture screenshots after the state closed, or run against a stale page that predates a hot reload.

**Why:** During the guided-tour fix, two "still broken" verdicts were based on a screenshot that showed the popover already closed and on stale-page runs — real fixes looked like failures.

**How to apply:** Require screenshots taken WHILE the disputed element is visible, ask for verification from rendered pixels (not DOM text), and instruct a hard reload before re-testing after frontend edits.
