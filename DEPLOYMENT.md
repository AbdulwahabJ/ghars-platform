# Deployment Guide — نظام متابعة زراعة الأسنان (Dr. Homam Dental Implant Follow-up System)

Internal clinic system for مجمع السن الرقمي الطبي. This document covers how to
run the system in production, how to back up and restore its data, and how to
verify a deployment is healthy.

> **Do not deploy without explicit approval from the clinic.** Publishing is a
> manual decision; nothing in this repository deploys automatically.

## 1. Architecture

| Piece | Path | Role |
| --- | --- | --- |
| Web frontend | `artifacts/dental-followup` | React + Vite SPA (Arabic, RTL) |
| API server | `artifacts/api-server` | Express + Drizzle ORM, session auth |
| Shared contracts | `lib/shared` | Zod schemas shared by both sides |
| DB schema/migrations | `lib/db` | Drizzle schema + SQL migrations |
| Durable files | Replit App Storage | Landing-page media objects |

The frontend calls the API under the same origin (`<base>/api/...`). The API
stores relational records, settings, sessions, and small data-URL avatars/logos
in PostgreSQL. Landing-page media bytes are stored separately in Replit App
Storage; PostgreSQL stores their ownership and metadata. Both stores are
stateful and must be included in recovery planning.

## 2. Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection string. The server refuses to start without it. |
| `SESSION_SECRET` | Yes | Signs session cookies. The server refuses to start without it. Use a long random value; changing it logs everyone out. |
| `INITIAL_SETUP_KEY` | Yes (first run only) | One-time key required by `/api/auth/setup` to create the first admin. Keep it secret; the endpoint disables itself after the first admin exists. |
| `PRIVATE_OBJECT_DIR` | Yes | Private App Storage directory used for landing-media staging and canonical objects. |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Yes on Replit | App Storage bucket selected for this deployment. |
| `PUBLIC_OBJECT_SEARCH_PATHS` | Platform-managed | Public object search paths supplied by Replit when configured. |
| `PORT` | Yes | Port each service binds to (assigned by the platform). |
| `NODE_ENV` | Yes | Set `production` in production. |

Secrets are managed through Replit's secrets manager — never commit them.

## 3. Build and start

```bash
pnpm install --frozen-lockfile

# Frontend static bundle (served at / by the Replit static artifact)
BASE_PATH=/ pnpm --filter @workspace/dental-followup run build

# API runnable artifact
pnpm --filter @workspace/api-server run build
NODE_ENV=production pnpm --filter @workspace/api-server run start
```

For Replit Publishing, the static frontend and runnable API are defined by
their registered artifact manifests. Replit injects `PORT`, serves the built
frontend at `/`, and forwards `/api` to the API artifact. Development workflow
commands are not production start commands.

## 4. Database migrations

Migrations live in `lib/db/migrations` and are applied with Drizzle:

```bash
pnpm --filter @workspace/db run migrate
```

- Run migrations **before** starting a new server version.
- Migrations are forward-only SQL files; review them before applying to
  production.
- Current head: `0021_landing_media_object_ownership`.
- `drizzle-kit check` must use repository-relative schema/output paths. The
  current absolute-path development config can trigger a Drizzle CLI path
  resolution error even when the journal is valid.

## 5. Backups and restore

The database is the single source of truth (patients, cases, implants,
finance, followups, audit log, settings, logo).

**Backup (daily recommended, before every deploy mandatory):**

```bash
pg_dump "$DATABASE_URL" --format=custom --file="backup-$(date +%Y%m%d-%H%M).dump"
```

**Restore:**

```bash
pg_restore --clean --if-exists --no-owner --dbname="$DATABASE_URL" backup-XXXX.dump
```

**Application-level export:** admins can download every entity as CSV from
الإعدادات ← تصدير البيانات. This is a human-readable complement to `pg_dump`,
not a substitute (it excludes user accounts by design).

There are **no automatic backups built into the app**. Before production
launch:

1. Verify the production database provider's managed backup/restore policy or
   schedule and test an external `pg_dump` backup job.
2. Verify App Storage retention/versioning or maintain a separate export of
   the `landing-media` object prefix. A database dump restores media metadata,
   not the corresponding object bytes.
3. Test a paired restore so the database media rows and immutable object
   generations refer to the same recovery point.

Until those provider-side checks are complete, backup readiness is not
verified.

## 6. Health checks

| Endpoint | Meaning |
| --- | --- |
| `GET /api/healthz` | Process is up (no DB check). |
| `GET /api/ready` | Runs `SELECT 1` against the DB; returns 503 if the DB is unreachable. Use this for load-balancer readiness. |

Both endpoints are unauthenticated and safe to poll.

## 7. Rollback procedure

1. Stop the new version.
2. Restore the pre-deploy database backup and matching App Storage recovery
   point (section 5) **if** the new version applied migrations or wrote bad
   data.
3. Start the previous application version.
4. Verify `GET /api/ready` returns 200 and spot-check a patient file.

Because migrations are forward-only, rolling back code past a migration
requires restoring the matching database backup.

## 8. First-run setup (fresh environment)

1. Set `DATABASE_URL`, `SESSION_SECRET`, `INITIAL_SETUP_KEY`, and the required
   App Storage variables.
2. Run migrations.
3. Start both services.
4. Open the app — it redirects to صفحة الإعداد الأولي; enter the setup key and
   create the first admin account.
5. Log in and configure الإعدادات (users, clinic branding, lookups).

## 9. Operational notes

- **Sessions** are stored in the `sessions` table; deactivating a user or
  resetting their password invalidates their sessions immediately.
- **Clinic logo** is stored in the DB as a data URL (≤500 KB) — no file
  storage to back up.
- **Landing media** is stored in App Storage. Do not delete an object unless
  its database ownership record and immutable generation have been verified.
- **Audit log** grows over time; it is append-only by design. CSV export is
  capped at 10,000 rows per download.
- **WhatsApp** messaging is manual (`wa.me` links); no external messaging API
  credentials are needed.
- **Legacy CSV import** (الإعدادات ← استيراد البيانات) never overwrites
  existing records; preview first, then commit.
