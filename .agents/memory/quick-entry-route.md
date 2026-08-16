---
name: Quick-entry atomic route
description: POST /api/quick-entry — one-shot patient registration with optional case, implants, payment, followup in a single DB transaction.
---

**Rule:** The quick-entry route is the only place where patient + case + implants + payment + followup are created atomically. All validations (duplicate file number, duplicate implant site, finance permission) throw a typed `{ __quick_entry_conflict: true, code, error }` object from inside the transaction, which the outer catch inspects and returns as 409/400.

**Why:** Ensures partial state is never committed — either everything lands or nothing does.

**How to apply:**
- Schema lives in `lib/shared/src/schemas/quick-entry.ts` and is exported from `lib/shared/src/index.ts`.
- Route registered in `artifacts/api-server/src/routes/index.ts` as `quickEntryRouter`.
- Frontend hook: `use-quick-entry.ts`, API method: `api.quickEntry(input)`.
- DB `numeric` columns (`diameter`, `length`, `baseTreatmentAmount`, `amount`) must be inserted as strings (use `.toFixed(2)` or `String()`).
- `fullNameNormalized` is required in the patients insert — use `normalizeArabicSearchText(fullName)`.
- `procedureTags` is `string[] | null` from DB; coerce with `?? []` when building the DTO.
