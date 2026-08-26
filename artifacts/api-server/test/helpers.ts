import pg from "pg";
import bcrypt from "bcryptjs";
import request from "supertest";
import type { Express } from "express";

export const SETUP_KEY = "test-setup-key-1234";
export const ADMIN_PASSWORD = "Passw0rd1234";

export type TestAgent = ReturnType<typeof request.agent>;

export function makePool(): pg.Pool {
  return new pg.Pool({ connectionString: process.env.DATABASE_URL });
}

/** Wipe all mutable tables in the test database (FK-safe). */
export async function truncateAll(pool: pg.Pool): Promise<void> {
  await pool.query(
    'TRUNCATE TABLE "system_errors", "platform_settings", "audit_logs", "sessions", "user_preferences", "patients", "users" CASCADE',
  );
  await pool.query(`DELETE FROM tenants WHERE reference_code <> 'internal'`);
  await pool.query(
    `UPDATE tenants
     SET status = 'ACTIVE', trial_started_at = NULL, trial_ends_at = NULL,
         suspended_at = NULL, activated_at = COALESCE(activated_at, now())
     WHERE reference_code = 'internal'`,
  );
}

export function agentFor(app: Express): TestAgent {
  return request.agent(app);
}

/** Attach a directly seeded test user to the legacy internal tenant. */
export async function attachUserToInternalTenant(
  pool: pg.Pool,
  username: string,
  role: "ADMIN" | "DOCTOR" | "ASSISTANT",
): Promise<void> {
  await pool.query(
    `INSERT INTO tenant_memberships (
       tenant_id, user_id, role, is_active,
       can_view_financials, can_record_payments
     )
     SELECT t.id, u.id, $2::user_role, u.is_active,
            u.can_view_financials, u.can_record_payments
     FROM tenants t
     JOIN users u ON u.username = $1
     WHERE t.reference_code = 'internal'
     ON CONFLICT (tenant_id, user_id) DO UPDATE SET
       role = EXCLUDED.role,
       is_active = EXCLUDED.is_active,
       can_view_financials = EXCLUDED.can_view_financials,
       can_record_payments = EXCLUDED.can_record_payments`,
    [username, role],
  );
}

/** Create the first admin through the real first-run setup endpoint. */
export async function setupAdmin(
  agent: TestAgent,
  username = "admin",
): Promise<{ id: string; username: string; role: string }> {
  const res = await agent.post("/api/auth/setup").send({
    setupKey: SETUP_KEY,
    username,
    email: `${username}@example.test`,
    fullName: "مدير النظام",
    password: ADMIN_PASSWORD,
  });
  if (res.status !== 201) {
    throw new Error(
      `admin setup failed: ${res.status} ${JSON.stringify(res.body)}`,
    );
  }
  return res.body.user;
}

export async function login(
  agent: TestAgent,
  username = "admin",
  password = ADMIN_PASSWORD,
): Promise<void> {
  const res = await agent
    .post("/api/auth/login")
    .send({ username, password });
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
}

/** Fresh admin session: truncate everything, run setup, log in. */
export async function freshAdminSession(
  app: Express,
  pool: pg.Pool,
): Promise<TestAgent> {
  await truncateAll(pool);
  await setupAdmin(agentFor(app), "platform-admin");
  const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, role)
     VALUES ('admin', NULL, $1, 'مدير العيادة', 'ADMIN')`,
    [passwordHash],
  );
  await attachUserToInternalTenant(pool, "admin", "ADMIN");
  const agent = agentFor(app);
  await login(agent);
  return agent;
}
