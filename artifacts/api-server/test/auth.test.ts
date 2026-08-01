import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  agentFor,
  makePool,
  setupAdmin,
  truncateAll,
} from "./helpers";

const pool = makePool();

beforeAll(async () => {
  await truncateAll(pool);
  await setupAdmin(agentFor(app));
});

afterAll(async () => {
  await pool.end();
});

describe("authentication and sessions", () => {
  it("rejects requests without a session", async () => {
    const res = await agentFor(app).get("/api/auth/me");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong password with a generic message and audits it", async () => {
    const res = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "Wrong0Password" });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");

    const audit = await pool.query(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'login_failed'",
    );
    expect(audit.rows[0].n).toBeGreaterThanOrEqual(1);
  });

  it("rejects an unknown username with the same generic error", async () => {
    const res = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "nobody", password: ADMIN_PASSWORD });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe("INVALID_CREDENTIALS");
  });

  it("logs in, issues an HttpOnly session cookie, and serves /me", async () => {
    const agent = agentFor(app);
    const res = await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: ADMIN_PASSWORD });
    expect(res.status).toBe(200);

    const setCookie = res.headers["set-cookie"]?.join(";") ?? "";
    expect(setCookie).toContain("dfs.sid=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("SameSite=Lax");

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.user.username).toBe("admin");
    expect(me.body.user).not.toHaveProperty("passwordHash");
  });

  it("destroys the session on logout", async () => {
    const agent = agentFor(app);
    await agent
      .post("/api/auth/login")
      .send({ username: "admin", password: ADMIN_PASSWORD });

    const out = await agent.post("/api/auth/logout");
    expect(out.status).toBe(204);

    const me = await agent.get("/api/auth/me");
    expect(me.status).toBe(401);
  });

  it("rejects a deactivated user", async () => {
    await pool.query("UPDATE users SET is_active = false WHERE username = 'admin'");
    const res = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: ADMIN_PASSWORD });
    expect(res.status).toBe(401);
    await pool.query("UPDATE users SET is_active = true WHERE username = 'admin'");
  });
});
