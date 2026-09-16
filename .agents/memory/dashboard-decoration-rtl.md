---
name: Dashboard decoration RTL
description: Root cause and positioning rule for full-width decorative layers inside RTL layouts.
---

Decorative full-width layers that use `left: 50%` with `translateX(-50%)` must keep physical left/right positioning independent of document direction. Do not pair a logical `start: 50%` anchor with a physical negative X transform.

**Why:** In RTL, `start: 50%` resolves to `right: 50%`, while `translateX(-50%)` still moves left. The centered layer can therefore be shifted completely outside the viewport. Logical `start/end` offsets on the side decorations can also mirror an intentionally fixed left/right composition.

**How to apply:** Use physical `left/right` for the centered canvas and its independently anchored decorative layers, keep `overflow-hidden` or `overflow-x: clip` to prevent scrollbars, and preserve `pointer-events: none`.