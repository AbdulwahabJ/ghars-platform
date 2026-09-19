---
name: Clinical date semantics
description: Canonical period attribution for implant and prosthetic dashboard and statistics metrics.
---

Clinical implant activity is attributed only by the owning case's procedure date. Prosthetic activity is attributed only by the prosthetic event date, independently of when the implant procedure occurred. Missing clinical dates contribute to no clinical period; record creation and update timestamps must never be fallbacks.

Dashboard prosthetic patients count distinct patients with any active canonical prosthetic event. Completed prosthetics count final/permanent (`تركيب دائم`) events only; temporary events are clinical activity but not completed work.

**Why:** Historical records can be entered long after treatment. Using the entry timestamp makes old care appear as current clinical activity and causes Dashboard and Statistics to disagree.

**How to apply:** Use Riyadh calendar boundaries for Today and This Month. Keep date-only clinical fields as date-only comparisons. Preserve creation timestamps only for explicit “date added,” audit, and operational-entry semantics.