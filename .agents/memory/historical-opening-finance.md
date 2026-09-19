---
name: Historical opening finance
description: Durable rules for importing legacy financial context without corrupting canonical Ghars payments.
---

Historical finance is an additive, tenant-scoped snapshot with nullable amounts and explicit verification. Unknown amounts remain null; zero means a confirmed zero. Historical paid amounts never become canonical Payment rows.

**Why:** Legacy records often lack reliable payment dates, methods, totals, or allocation details. Converting them into normal payments would invent facts and distort current operational reporting.

**How to apply:** Require explicit verification before importing numeric historical finance. Calculate current balance as verified opening remaining balance plus new Ghars charges minus discounts and real dated Ghars payments. Keep clinical status independent from financial status and preserve unresolved raw finance text as non-numeric context.