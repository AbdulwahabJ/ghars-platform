---
name: Latin-digit boundary
description: Durable rules for enforcing Latin digits without corrupting user-entered Arabic text.
---

Ghars-generated numeric values must use ASCII `0-9` in every locale and output surface. Normalize Arabic-Indic and Persian numeral characters only at typed numeric/technical boundaries: shared numeric inputs, semantic numeric API fields, formatter output, dates, money, percentages, counters, and explicitly marked technical export columns.

**Why:** A document-wide DOM mutation can diverge from React controlled state, while normalizing every string can silently rewrite patient names, notes, and other genuine user content.

**How to apply:** Use explicit `latn` Intl options and centralized formatters. Preserve arbitrary free-text fields and generic CSV escaping. Opt technical identifiers into export normalization, normalize semantic numeric JSON keys before submission, and keep regression tests for both zero system digits and unchanged free text.