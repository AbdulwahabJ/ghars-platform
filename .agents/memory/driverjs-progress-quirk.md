---
name: driver.js progress quirk
description: Per-step showProgress:false silently ignored in driver.js 1.x — use onPopoverRender
---

In driver.js 1.x, the render path merges per-step popover options with `||` (`showProgress: r.showProgress || getConfig("showProgress")`), so a per-step `showProgress: false` can never override a global `showProgress: true`. Per-step `progressText: ""` also falls back via `||`.

**Why:** Cost several failed fix rounds on the guided tour's final screen (counter "7 من 6" kept rendering).

**How to apply:** To hide the progress counter on specific steps, use the global `onPopoverRender(popover, { state })` hook and set `popover.progress.style.display = "none"` for the target `state.activeIndex`. See `artifacts/dental-followup/src/components/GuidedTour.tsx`.
