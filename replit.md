# نظام متابعة زراعة الأسنان – د. همام

Arabic-first, RTL-only dental implant follow-up system for Dr. Homam's clinic (مجمع السن الرقمي الطبي). Used internally by doctor, assistant, and admin — no public registration.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (reads `PORT`; routes under `/api`)
- `pnpm --filter @workspace/dental-followup run dev` — web frontend (Vite; requires `PORT` and `BASE_PATH` env)
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- `pnpm --filter @workspace/api-server run typecheck` / `pnpm --filter @workspace/dental-followup run typecheck`
- Required env: `DATABASE_URL`; secrets: `INITIAL_SETUP_KEY` (first-run admin creation), `SESSION_SECRET`

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5, express-session + connect-pg-simple, Argon2 password hashing
- DB: PostgreSQL + Drizzle ORM
- Validation: shared Zod schemas in `lib/shared` (`@workspace/shared`) — NOT OpenAPI codegen
- Frontend: React + Vite, react-router, TanStack Query, shadcn/ui, Tailwind, driver.js (tour), Tajawal font

## Where things live

- `lib/shared/src/schemas/` — API contracts (Zod), single source of truth shared by both sides
- `lib/shared/src/phone.ts` — Saudi/international mobile normalization; `lib/shared/src/arabic.ts` — Arabic search normalization
- `lib/db/src/schema/` — 16 Drizzle tables, one file each
- `artifacts/api-server/src/` — routes (auth, patients, preferences, health), middlewares (session, csrf, auth), lib (permissions, audit, validation)
- `artifacts/dental-followup/src/` — pages (Setup, Login, Dashboard, PatientsList, PatientFile, Finance), `components/GuidedTour.tsx`, `lib/api.ts` (typed fetch helpers)
- Clinic logo: `artifacts/dental-followup/src/assets/clinic-logo.png` — copied verbatim from attached asset; NEVER modify
- Spec (source of truth): `attached_assets/Pasted-CRITICAL-EXECUTION-RULES-READ-THIS-ENTIRE-SPECIFICATION_1785569233237.txt`

## Architecture decisions

- No OpenAPI codegen: shared Zod schemas + typed fetch helpers instead (user-approved deviation from template default)
- Money is `numeric(12,2)` with DB CHECK constraints; never floats; no stored derived totals
- CSRF: SameSite-lax cookies + Origin/Referer host validation on state-changing requests (documented in `middlewares/csrf.ts`); trust proxy 1
- Permissions: role defaults + nullable per-user boolean overrides (effective = override ?? role default); ADMIN true/true, DOCTOR and ASSISTANT false/false by default
- `file_number` globally unique including archived patients; stored canonicalized to Latin digits
- First-run setup gated by `INITIAL_SETUP_KEY` (timing-safe compare); setup disabled permanently after first admin exists

## Product

Phase 1 (done): first-run setup, login/logout, sessions, header navigation (3 tabs, no sidebar), dashboard with greeting + global search, patients CRUD with archive/restore and duplicate-file-number dialogs, guided tour (6 steps + final screen), quick help, shortcuts dictionary, honest empty states (finance module, patient sub-tabs). Phase 2 (done, approved): implant cases + implants inside patient files (FDI chart, duplicate-site guard, archive/restore, lookup options). Phase 3 (done): financial tracking — base treatment amount, charges (implant-linkable), discounts, non-deletable payments with void+reason+audit, computed case summaries (never stored), payment statuses (incl. مؤجل ماليًا from case status مؤجل), patient الدفعات tab, finance page (period/patient/method/status/system filters, 7 KPIs, 2 charts, payments table, CSV export with UTF-8 BOM, browser print), backend-enforced financial permissions (effective = user override ?? role default). Phase 4 (done): follow-ups + WhatsApp — المتابعة patient tab (14 follow-up types, 7 statuses, overdue/today/contact-task buckets on Riyadh calendar days), outcome recording, postpone-as-transaction (old record closed مؤجلة + new مجدولة created, history preserved), WhatsApp deep-link only (wa.me via 6 read-only seeded templates, never claims sent/delivered/read), communications timeline with 7 results, live notifications bell (computed from DB, no notifications table: overdue/today/contact-due/ready-case جاهز للتركيب), audits for all follow-up and communication actions. Closed statuses (تمت/ملغاة/مؤجلة) block edits with 409 FOLLOWUP_CLOSED; archived patients/cases block all writes 409. Phase 5 (done): dashboard + reports — live overview (8 operational KPIs + 2 finance KPIs gated to ADMIN/canViewFinancials, actionable lists: today's appointments, overdue follow-ups, ready cases, contact tasks, recent audit activity, 60s refresh), statistics section (period/doctor/system/case-status filters; exactly 3 charts: cases+implants over time with day/month buckets, implant-system pie, case-status bar; implant-status/outcome/failure tiles), operational report (one row per case: implants, systems, next follow-up, overdue/ready flags, finance columns only when permitted; CSV export with BOM + audit, browser print with print-only header), patient الملخص tab (full summary + archived toggle + whole-file and per-case print). All report SQL excludes archived patients/cases/implants everywhere, incl. payments feeding collectedThisMonth; Riyadh timezone throughout. New endpoints: GET /api/dashboard, /api/statistics, /api/reports/operational(+/export.csv) in `artifacts/api-server/src/routes/reports.ts`, contracts in `lib/shared/src/schemas/reports.ts`. Phase 6 (settings) not started — specs in `.local/tasks/phase-*.md`.

## User preferences

- User communicates in English; UI is 100% Arabic RTL. No emojis anywhere.
- Strict no-invented-features rule: nothing beyond the spec (no dark mode, no sidebar, no fake/seed data, no dead buttons; settings icon hidden until Phase 6)
- Confirm-and-stop at each phase gate: finish phase, report, wait for approval before next phase
- Refer to tasks as "Task #N"

## Gotchas

- Vite config requires `PORT` and `BASE_PATH` env vars (throws otherwise) — set both when running builds manually
- Frontend must prefix API calls with `import.meta.env.BASE_URL` (see `src/lib/api.ts`); never root-relative `/api/...` hardcoding
- All dates display in Asia/Riyadh via `src/lib/datetime.ts`; never patient data in localStorage or logs
- driver.js merges per-step `showProgress` with `||` at render time — per-step `false` cannot override global `true`; use the `onPopoverRender` DOM hook (see `GuidedTour.tsx`)
- Riyadh is fixed UTC+03 (no DST): shared Zod schemas transform UI datetime-local strings by appending `+03:00`; day-boundary logic (overdue/today) lives in `lib/shared/src/schemas/followups.ts` helpers

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
