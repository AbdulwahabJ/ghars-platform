---
name: Permanent activation invariant
description: How permanent commercial activation interacts with suspension, trial history, and lifecycle actions.
---

A tenant that has ever been permanently activated remains a permanent-license tenant even while its current status is suspended. Trial actions must be gated by permanent activation history, not only by whether the current status is active. Reactivation restores active access without restarting or extending the historical trial, and repeated activation must preserve the original activation date.

**Why:** Suspension changes the current status but does not revoke the purchased permanent license. Checking only the current status allowed a suspended permanent tenant to be converted back into a trial and erased the intended lifecycle semantics.

**How to apply:** For future commercial lifecycle endpoints and UI actions, distinguish current access state from permanent activation history. Treat trial dates as historical once permanent activation exists.