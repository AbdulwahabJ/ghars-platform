---
name: Authed UI verification without real credentials
description: How to visually verify login-protected UI without the user's password or touching dev data
---

# Verifying authenticated UI safely

**Rule:** To gather visual evidence for pages behind login, use the testing subagent with a workflow env override pointing the API at the disposable test database (`dental_followup_test`), seed a throwaway admin + data there, run the browser checks, then restart the API workflow normally to restore the dev environment.

**Why:** The dev DB holds real clinic data that must never be modified or reseeded, and the admin password is unknown to the agent. Shell-launched `nohup`, `setsid`, and `&` processes do not reliably survive tool sessions; a managed background shell task does. A local hashed-build preview that proxies the API must preserve the browser's original host in the forwarded-host header, or the app's CSRF check correctly rejects login as a mismatched origin.

**How to apply:**
1. Tester task: derive test DB URL from `DATABASE_URL` (pathname → `/dental_followup_test`), restart the API workflow with `DATABASE_URL` + `INITIAL_SETUP_KEY` overrides, truncate test tables, create admin via `/api/auth/setup`, seed via API, then run browser steps on the normal app preview.
2. Afterwards the main agent must restart the API workflow (no overrides) and confirm dev data counts + `setup-status` are back to normal.
3. Per the tester-evidence rule, view the key screenshots yourself before reporting success.

For hashed-build browser QA, a persistent background preview can serve the built frontend and proxy API traffic to the managed API (still pointed at the disposable DB). Preserve the browser Host through the proxy rather than disabling CSRF; restore the API workflow and stop the temporary preview afterward. A real resume throttle can be exercised without a long browser-tool sleep by advancing only the tab's JavaScript clock for the focus event, then restoring it. This does not change server session or cookie time.

The app-preview screenshot tool starts a separate unauthenticated browser context; it cannot reuse an authenticated session visible in workflow logs. Do not work around this by changing auth code or seeding the development database.
