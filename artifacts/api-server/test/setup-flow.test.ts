import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  SETUP_KEY,
  agentFor,
  makePool,
  truncateAll,
} from "./helpers";

const pool = makePool();
const agent = agentFor(app);

beforeAll(async () => {
  await truncateAll(pool);
});

afterAll(async () => {
  await pool.end();
});

describe("first-run setup flow", () => {
  it("reports setupRequired=true when no admin exists", async () => {
    const res = await agent.get("/api/auth/setup-status");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ setupRequired: true });
  });

  it("rejects a wrong setup key", async () => {
    const res = await agent.post("/api/auth/setup").send({
      setupKey: "wrong-key",
      username: "admin",
      fullName: "مدير النظام",
      password: ADMIN_PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("INVALID_SETUP_KEY");
  });

  it("rejects a weak password", async () => {
    const res = await agent.post("/api/auth/setup").send({
      setupKey: SETUP_KEY,
      username: "admin",
      fullName: "مدير النظام",
      password: "short1",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("VALIDATION_ERROR");
  });

  it("creates the first admin with a valid key", async () => {
    const res = await agent.post("/api/auth/setup").send({
      setupKey: SETUP_KEY,
      username: "Admin",
      fullName: "مدير النظام",
      password: ADMIN_PASSWORD,
    });
    expect(res.status).toBe(201);
    expect(res.body.user.role).toBe("ADMIN");
    // Username is stored lowercased.
    expect(res.body.user.username).toBe("admin");
    // Response never leaks a password hash.
    expect(JSON.stringify(res.body)).not.toContain("passwordHash");

    const audit = await pool.query(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'user_create'",
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("reports setupRequired=false afterwards and blocks a second setup", async () => {
    const status = await agent.get("/api/auth/setup-status");
    expect(status.body).toEqual({ setupRequired: false });

    const res = await agent.post("/api/auth/setup").send({
      setupKey: SETUP_KEY,
      username: "admin2",
      fullName: "مدير آخر",
      password: ADMIN_PASSWORD,
    });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe("SETUP_DISABLED");

    const users = await pool.query("SELECT count(*)::int AS n FROM users");
    expect(users.rows[0].n).toBe(1);
  });

  it("allows the created admin to log in (case-insensitive username)", async () => {
    const res = await agent
      .post("/api/auth/login")
      .send({ username: "ADMIN", password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.username).toBe("admin");
    expect(res.body.preferences.onboardingStatus).toBe("not_started");
  });
});
