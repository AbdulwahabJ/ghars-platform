---
name: Importer canonical header authority
description: Why recognized structured clinical headers must override stale tenant mapping history during normalization.
---

Recognized Q, Former, Graft, Pros, and NOTE headers remain authoritative canonical inputs during data application, even when a tenant's learned mapping history classifies them as legacy notes. Unknown Pros still requires review, and ambiguous single implant values still require explicit apply-to-all.

**Why:** A previously approved mapping can persist after extraction improves. Trusting that stale destination suppressed visible structured values and duplicated them into legacy notes.

**How to apply:** Preserve flexible mapping for unknown headers, but apply deterministic structured-header semantics at normalization. Keep validation, per-implant count matching, and explicit ambiguity resolution unchanged.