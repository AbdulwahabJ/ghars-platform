---
name: Finance permission model decisions
description: How financial permissions are tiered in the dental app — future phases must stay consistent
---

# Financial permission tiers (Phase 3 decisions)

Three backend-enforced tiers, all derived from effective permissions (`user override ?? role default`, computed in the API's permissions lib):

1. **Case-level finance read** (`GET /implant-cases/:id/finance`): allowed with `canViewFinancials` OR `canRecordPayments` — an assistant permitted to record payments needs the case summary as context, but this does NOT grant clinic-wide access.
2. **Clinic-wide finance** (`/finance/overview`, CSV export): `canViewFinancials` only.
3. **Financial management** (base amount, charges, discounts, payment void): ADMIN, or DOCTOR with `canViewFinancials`. Assistants never manage, regardless of overrides.

Other binding decisions:
- Payment status "مؤجل ماليًا" is derived from case status "مؤجل" (no stored flag); ordering: overpaid > fully paid > deferred > partial > unpaid. Shared `calcPaymentStatus` in lib/shared is the single source — backend and any future frontend use must call it.
- All money arithmetic in integer cents (`toCents`); SQL SUMs come back as strings → `Number()` → cents. Derived totals are never stored.
- Discount `approved_by` is set to the creating user (only manage-tier users can create discounts, so creator = approver).
- CSV exports need a UTF-8 BOM prefix or Arabic breaks in Excel.

**Why:** spec mandates DOCTOR sees financials only if explicitly enabled and ASSISTANT gets no broader access from payment recording; deferred is a case-level clinical state, not a payment record.
**How to apply:** Phase 4–6 features (dashboards, reports, settings) touching money must reuse these tiers and `calcPaymentStatus`, not invent new checks.
