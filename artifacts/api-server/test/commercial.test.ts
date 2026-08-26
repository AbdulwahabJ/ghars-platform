import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import app from "../src/app";
import { agentFor, freshAdminSession, makePool, truncateAll } from "./helpers";

const pool = makePool();
let lastToken = "";

beforeEach(async () => {
  await truncateAll(pool);
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.APP_BASE_URL;
  lastToken = "";
});
afterAll(async () => { await pool.end(); });

function emailConfigured() {
  process.env.RESEND_API_KEY = "test";
  process.env.RESEND_FROM = "test@example.test";
  process.env.APP_BASE_URL = "https://app.example.test";
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    const body = JSON.parse(String(options.body));
    const text = body.text as string;
    lastToken = new URL(text.match(/https?:\/\/\S+/)![0]).searchParams.get("token")!;
    return new Response("", { status: 200 });
  }));
}

const registration = {
  tenantName: "Clinic", ownerName: "Owner", username: "owner",
  email: "owner@example.test", password: "Passw0rd1234", locale: "en",
};

describe("commercial lifecycle", () => {
  it("fails signup configuration before inserts", async () => {
    const res = await agentFor(app).post("/api/auth/register").send(registration);
    expect(res.status).toBe(503);
    const count = await pool.query("SELECT count(*)::int AS count FROM tenants WHERE reference_code <> 'internal'");
    expect(count.rows[0].count).toBe(0);
  });

  it("starts a 72-hour trial exactly once", async () => {
    emailConfigured();
    expect((await agentFor(app).post("/api/auth/register").send(registration)).status).toBe(201);
    const verify = await agentFor(app).post("/api/auth/verify-email").send({ token: lastToken });
    expect(verify.status).toBe(200);
    const tenant = await pool.query("SELECT status, trial_started_at, trial_ends_at FROM tenants WHERE contact_email = $1", [registration.email]);
    expect(tenant.rows[0].status).toBe("TRIAL");
    expect(new Date(tenant.rows[0].trial_ends_at).getTime() - new Date(tenant.rows[0].trial_started_at).getTime()).toBe(72 * 60 * 60 * 1000);
    expect((await agentFor(app).post("/api/auth/verify-email").send({ token: lastToken })).status).toBe(422);
  });

  it("keeps commercial status available for an expired tenant and deduplicates activation requests", async () => {
    const customer = await freshAdminSession(app, pool);
    const internal = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE reference_code = 'internal'");
    await pool.query("UPDATE tenants SET status = 'TRIAL', trial_started_at = now() - interval '4 days', trial_ends_at = now() - interval '1 day' WHERE id = $1", [internal.rows[0].id]);
    expect((await customer.get("/api/patients")).status).toBe(403);
    expect((await customer.get("/api/commercial/status")).status).toBe(200);
    const first = await customer.post("/api/commercial/activation-requests").send({ note: "please" });
    const second = await customer.post("/api/commercial/activation-requests").send({ note: "again" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.request.id).toBe(first.body.request.id);
  });

  it("denies customer admins and lets explicit platform admins activate, suspend, and extend", async () => {
    const customer = await freshAdminSession(app, pool);
    const admin = await pool.query<{ id: string }>("SELECT id FROM users WHERE username = 'admin'");
    await pool.query("DELETE FROM platform_admins WHERE user_id = $1", [admin.rows[0].id]);
    expect((await customer.get("/api/platform-admin/tenants")).status).toBe(403);
    await pool.query("INSERT INTO platform_admins (user_id) VALUES ($1)", [admin.rows[0].id]);
    const tenant = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE reference_code = 'internal'");
    expect((await customer.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/activate`)).status).toBe(200);
    expect((await customer.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/suspend`)).status).toBe(200);
    expect((await customer.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/extend-trial`).send({ days: 3 })).status).toBe(200);
  });
});