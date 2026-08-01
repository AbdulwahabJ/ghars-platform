import pg from "pg";
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
    'TRUNCATE TABLE "audit_logs", "sessions", "user_preferences", "patients", "users" CASCADE',
  );
}

export function agentFor(app: Express): TestAgent {
  return request.agent(app);
}

/** Create the first admin through the real first-run setup endpoint. */
export async function setupAdmin(
  agent: TestAgent,
  username = "admin",
): Promise<{ id: string; username: string; role: string }> {
  const res = await agent.post("/api/auth/setup").send({
    setupKey: SETUP_KEY,
    username,
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
  const agent = agentFor(app);
  await setupAdmin(agent);
  await login(agent);
  return agent;
}
