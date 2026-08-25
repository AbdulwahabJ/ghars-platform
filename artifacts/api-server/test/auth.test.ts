import { createHash } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
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

  it("returns a non-account-specific configuration error before password-reset lookup", async () => {
    const res = await agentFor(app)
      .post("/api/auth/password-reset/request")
      .send({ identifier: "nobody@example.test" });
    expect(res.status).toBe(503);
    expect(res.body.code).toBe("EMAIL_NOT_CONFIGURED");
  });

  it("sends a recovery link without storing its raw token or exposing unknown accounts", async () => {
    const oldFetch = globalThis.fetch;
    const oldApiKey = process.env.RESEND_API_KEY;
    const oldFrom = process.env.RESEND_FROM;
    const oldAppBaseUrl = process.env.APP_BASE_URL;
    const sent: Array<{ text: string }> = [];
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM = "Ghars <no-reply@example.test>";
    process.env.APP_BASE_URL = "https://ghars.example.test/";
    globalThis.fetch = async (_input, init) => {
      sent.push(JSON.parse(String(init?.body)) as { text: string });
      return new Response(JSON.stringify({ id: "email_test_1" }), { status: 200 });
    };

    try {
      const unknown = await agentFor(app)
        .post("/api/auth/password-reset/request")
        .send({ identifier: "nobody@example.test" });
      expect(unknown.status).toBe(200);
      expect(unknown.body.message).toContain("رابط إعادة التعيين");
      expect(sent).toHaveLength(0);

      const known = await agentFor(app)
        .post("/api/auth/password-reset/request")
        .send({ identifier: "ADMIN@EXAMPLE.TEST" });
      expect(known.status).toBe(200);
      expect(known.body).toEqual(unknown.body);
      await vi.waitFor(() => expect(sent).toHaveLength(1));

      const resetUrl = new URL(
        sent[0]!.text.match(/https:\/\/\S+/)?.[0] ?? "",
      );
      const rawToken = resetUrl.searchParams.get("token");
      expect(rawToken).toBeTruthy();

      const stored = await pool.query(
        "SELECT token_hash, expires_at FROM password_reset_tokens",
      );
      expect(stored.rowCount).toBe(1);
      expect(stored.rows[0].token_hash).toBe(
        createHash("sha256").update(rawToken!, "utf8").digest("hex"),
      );
      expect(stored.rows[0].token_hash).not.toBe(rawToken);
      expect(new Date(stored.rows[0].expires_at).getTime()).toBeGreaterThan(
        Date.now(),
      );
    } finally {
      globalThis.fetch = oldFetch;
      if (oldApiKey === undefined) delete process.env.RESEND_API_KEY;
      else process.env.RESEND_API_KEY = oldApiKey;
      if (oldFrom === undefined) delete process.env.RESEND_FROM;
      else process.env.RESEND_FROM = oldFrom;
      if (oldAppBaseUrl === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = oldAppBaseUrl;
    }
  });

  it("consumes a reset token once, changes the password, and invalidates sessions", async () => {
    const [user] = (
      await pool.query("SELECT id FROM users WHERE username = 'admin'")
    ).rows as Array<{ id: string }>;
    const rawToken = "valid-reset-token-012345678901234567890123456";
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() + interval '30 minutes')`,
      [user!.id, tokenHash],
    );

    const loggedIn = agentFor(app);
    await loggedIn
      .post("/api/auth/login")
      .send({ username: "admin", password: ADMIN_PASSWORD });
    expect((await loggedIn.get("/api/auth/me")).status).toBe(200);

    const reset = await agentFor(app)
      .post("/api/auth/password-reset/complete")
      .send({ token: rawToken, password: "Changed0Password" });
    expect(reset.status).toBe(204);
    expect((await loggedIn.get("/api/auth/me")).status).toBe(401);

    const oldPassword = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: ADMIN_PASSWORD });
    expect(oldPassword.status).toBe(401);
    const newPassword = await agentFor(app)
      .post("/api/auth/login")
      .send({ username: "admin", password: "Changed0Password" });
    expect(newPassword.status).toBe(200);

    const reused = await agentFor(app)
      .post("/api/auth/password-reset/complete")
      .send({ token: rawToken, password: "Another0Password" });
    expect(reused.status).toBe(422);
    expect(reused.body.code).toBe("RESET_TOKEN_INVALID");

    const audit = await pool.query(
      `SELECT action FROM audit_logs
       WHERE action = 'password_reset_completed' AND user_id = $1`,
      [user!.id],
    );
    expect(audit.rowCount).toBe(1);
  });

  it("rejects an expired reset link", async () => {
    const [user] = (
      await pool.query("SELECT id FROM users WHERE username = 'admin'")
    ).rows as Array<{ id: string }>;
    const rawToken = "expired-reset-token-01234567890123456789012";
    const tokenHash = createHash("sha256").update(rawToken, "utf8").digest("hex");
    await pool.query(
      `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, now() - interval '1 minute')`,
      [user!.id, tokenHash],
    );

    const res = await agentFor(app)
      .post("/api/auth/password-reset/complete")
      .send({ token: rawToken, password: "NewValid0Password" });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe("RESET_TOKEN_INVALID");
  });
});
