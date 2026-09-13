---
name: Wouter query state
description: How query-driven UI in this app must subscribe to URL changes.
---

Use Wouter's query-specific subscription when tabs, sections, filters, or targets are controlled by search parameters. Do not depend on `useLocation` alone for query-only changes.

**Why:** Wouter's location state can remain unchanged when only the search string changes, which breaks same-page navigation and browser Back/Forward synchronization.

**How to apply:** Read query state with `useSearch`, derive the rendered state from it, and keep generated links locale-independent with internal parameter values.