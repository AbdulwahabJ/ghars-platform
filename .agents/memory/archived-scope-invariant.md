---
name: Archived-scope invariant in aggregate queries
description: Every KPI/report/aggregate SQL must exclude archived patients AND cases, including payment sums
---

# Archived exclusion is per-entity, not just per-patient

**Rule:** Any raw-SQL count, list, or money aggregate must join through BOTH `patients.archived_at IS NULL` AND `implant_cases.archived_at IS NULL` (and implant `archived_at` where implants are counted). This includes `payments` aggregations — a payment row carries no archived flag itself; it must be scoped via its case + patient.

**Why:** Phase 5 dashboard initially filtered follow-up KPIs only on non-archived patients and summed monthly payments with no case join; the review round caught archived cases inflating KPIs and collected-this-month. Follow-ups/payments reference both patient and case, so filtering one is not enough.

**How to apply:** When writing any new report/statistics/dashboard query, start from the "active case of active patient" join fragment and add entity-specific filters on top. Regression tests should seed follow-ups + payments on a case BEFORE archiving it, then assert the aggregates ignore them.
