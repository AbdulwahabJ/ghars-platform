---
name: Idle error forensics
description: Production evidence separates session-expiry failures from an independent dashboard render loop.
---

**Rule:** Do not treat every dashboard React update-depth error as proof of session expiry. Correlate the render-error timestamp with nearby authentication responses and preserve the component stack.

**Why:** Production reported the same React #185 error both immediately after authenticated endpoints switched to 401 and on a separate occasion after successful `/api/auth/me` 304 responses. The boundary records a React render error at a Select trigger, not a thrown API query error. Session cleanup can prevent the expired-user page from remaining mounted, but it does not establish the cause of the valid-session render loop.

**How to apply:** When investigating another long-open-tab failure, first distinguish 401-driven stale-auth UI from a valid-session Select render loop and from a missing lazy chunk. Reproduce each independently before attributing one to the other.