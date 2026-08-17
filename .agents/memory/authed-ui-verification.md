---
name: Authed UI verification without real credentials
description: How to visually verify login-protected UI without the user's password or touching dev data
---

# Verifying authenticated UI safely

**Rule:** To gather visual evidence for pages behind login, use the testing subagent with a workflow env override pointing the API at the disposable test database (`dental_followup_test`), seed a throwaway admin + data there, run the browser checks, then restart the API workflow normally to restore the dev environment.

**Why:** The dev DB holds real clinic data that must never be modified or reseeded, and the admin password is unknown to the agent. Manually started background servers (`nohup`, `setsid`, `&`) do NOT survive across shell tool sessions in this environment, so a hand-rolled temp stack on side ports dies before a tester can reach it.

**How to apply:**
1. Tester task: derive test DB URL from `DATABASE_URL` (pathname → `/dental_followup_test`), restart the API workflow with `DATABASE_URL` + `INITIAL_SETUP_KEY` overrides, truncate test tables, create admin via `/api/auth/setup`, seed via API, then run browser steps on the normal app preview.
2. Afterwards the main agent must restart the API workflow (no overrides) and confirm dev data counts + `setup-status` are back to normal.
3. Per the tester-evidence rule, view the key screenshots yourself before reporting success.

The app-preview screenshot tool starts a separate unauthenticated browser context; it cannot reuse an authenticated session visible in workflow logs. Do not work around this by changing auth code or seeding the development database.
