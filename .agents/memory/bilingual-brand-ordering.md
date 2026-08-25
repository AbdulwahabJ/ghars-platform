---
name: Bilingual brand ordering
description: Keep Arabic and Latin brand labels in the intended visual sequence inside RTL pages.
---

For a bilingual label that must visibly read `غرس | Ghars`, use an explicit LTR inline wrapper, isolate the Arabic word in a nested RTL span, and keep the Latin text in its own Latin-font span.

**Why:** An outer RTL context reorders mixed-direction inline text and neutral punctuation, which can render the label as `Ghars | غرس` or drop the visual separator.

**How to apply:** Use this pattern for compact Arabic/Latin brand lockups in headers, authentication screens, print surfaces, or any new RTL UI that needs a fixed visual sequence.