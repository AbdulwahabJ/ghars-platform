---
name: Browser-translate DOM crash
description: removeChild NotFoundError on "<Text>" = browser translation mutating React text nodes; how to diagnose and the mitigation pattern used in this app.
---

# Browser-translate React crash

**Rule:** In this Arabic-UI app, any label that conditionally swaps with an icon/spinner must be wrapped in an element (`<span>`), never left as a bare text node. `index.html` carries `translate="no"` on `<html>` plus `<meta name="google" content="notranslate">` — keep both when regenerating the shell.

**Why:** Chrome auto-translate (Arabic → user's language) wraps React-managed raw text nodes in `<font>` tags. When React later removes that text node during a pending-state swap, `removeChild` throws `NotFoundError`. React names the crashed fiber `<Text>` in the error-boundary warning — that means a HostText (plain DOM text node), not any app component; a spurious "Invalid hook call" warning can appear alongside. The spec also mandates exact Arabic copy, so machine translation is unwanted anyway.

**How to apply:** If a runtime error says `removeChild`/`insertBefore` NotFoundError with component `<Text>`, suspect translation or another DOM-mutating extension first — do not hunt for an app bug in the named page. Check that crash timestamps align with pending-state text swaps. Mitigate with the span-wrap pattern and the notranslate declarations; do not monkey-patch `Node.prototype`.
