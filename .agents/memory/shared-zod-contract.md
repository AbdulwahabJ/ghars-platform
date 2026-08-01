---
name: Shared Zod instead of codegen
description: API contract strategy for this monorepo — lib/shared Zod schemas, not OpenAPI/Orval
---

This project deliberately does NOT use the template's OpenAPI/Orval codegen pipeline. API contracts are hand-written Zod schemas in `lib/shared` (`@workspace/shared`), imported by both the api-server (validation) and the frontend (types + typed fetch helpers in `src/lib/api.ts`).

**Why:** User-approved decision — the existing api-spec/api-zod/api-client-react libs stay untouched (keep `/api/healthz`), and shared Zod gives one source of truth with Arabic validation messages.

**How to apply:** New endpoints = add schema to `lib/shared/src/schemas/`, validate server-side with `parseOrRespond`, add a typed helper to the frontend `api.ts`. Composite tsc builds require `pnpm exec tsc -b lib/shared lib/db` after changing lib sources, or dependents fail with TS6305.
