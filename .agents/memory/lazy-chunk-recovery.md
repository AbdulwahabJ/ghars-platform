---
name: Lazy chunk recovery
description: Recovery and diagnostics rules for stale or missing route chunks
---

**Rule:** Recover only recognized dynamic-import or chunk-load failures with one automatic reload scoped to the current build and route. Clear the guard only after that route renders successfully; ordinary render errors must never trigger a reload.

**Why:** A rejected React.lazy import stays cached, so resetting queries or clearing the boundary cannot recover even after the network returns. An unguarded reload can instead trap users in an infinite loop when the chunk remains unavailable.

**How to apply:** Keep route/build identification in client diagnostics, preserve the existing fallback for persistent failures, and test both a first-request-only failure (one reload then success) and a persistent failure (one reload then stable fallback).