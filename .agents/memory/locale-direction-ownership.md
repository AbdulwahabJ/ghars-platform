---
name: Locale direction ownership
description: The locale boundary, including shared overlay primitives, is the single source of truth for RTL/LTR layout.
---

Use the selected locale as the sole source of `dir` for the application shell and shared portal primitives. Prefer CSS logical alignment and spacing (`start`/`end`) so ordinary flex layouts reverse naturally when the document direction changes.

**Why:** A hardcoded RTL wrapper can make translated English text look correct while leaving title/action order, table alignment, dialogs, and dropdowns visually reversed. Portals are especially susceptible because they do not inherit a page component's direction reliably.

**How to apply:** Do not introduce `dir="rtl"` or physical left/right alignment for translatable interface chrome. Use a current-locale direction only where a portal needs it. Keep explicit LTR only for values whose format is inherently directional, such as identifiers, phone numbers, dates, numeric fields, and charts.