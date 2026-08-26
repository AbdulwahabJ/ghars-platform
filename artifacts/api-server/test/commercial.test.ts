import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import { agentFor, freshAdminSession, makePool, truncateAll } from "./helpers";

const pool = makePool();

beforeEach(async () => {
  await truncateAll(pool);
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_FROM;
  delete process.env.APP_BASE_URL;
});
afterAll(async () => { await pool.end(); });

const registration = {
  tenantName: "Clinic", ownerName: "Owner", username: "owner",
  phone: "0551234567", city: "Riyadh",
  password: "Passw0rd1234", confirmPassword: "Passw0rd1234", locale: "en",
};

describe("commercial lifecycle", () => {
  it("exposes only support contacts publicly and keeps lifecycle routes authenticated", async () => {
    const anonymous = agentFor(app);
    const support = await anonymous.get("/api/commercial/support");
    expect(support.status).toBe(200);
    expect(Object.keys(support.body).sort()).toEqual(["email", "phone", "whatsapp"]);
    expect((await anonymous.get("/api/commercial/status")).status).toBe(401);
    expect(
      (await anonymous.post("/api/commercial/activation-requests").send({ note: "please" })).status,
    ).toBe(401);
  });

  it("registers without email or Resend configuration", async () => {
    const res = await agentFor(app).post("/api/auth/register").send(registration);
    expect(res.status).toBe(201);
    const count = await pool.query("SELECT count(*)::int AS count FROM tenants WHERE reference_code <> 'internal'");
    expect(count.rows[0].count).toBe(1);
  });

  it("starts the 72-hour trial atomically at registration", async () => {
    expect((await agentFor(app).post("/api/auth/register").send(registration)).status).toBe(201);
    const tenant = await pool.query("SELECT status, trial_started_at, trial_ends_at, contact_phone FROM tenants WHERE contact_phone = '966551234567'");
    expect(tenant.rows[0].status).toBe("TRIAL");
    expect(tenant.rows[0].contact_phone).toBe("966551234567");
    expect(new Date(tenant.rows[0].trial_ends_at).getTime() - new Date(tenant.rows[0].trial_started_at).getTime()).toBe(72 * 60 * 60 * 1000);
  });

  it("keeps commercial status available for an expired tenant and deduplicates activation requests", async () => {
    await freshAdminSession(app, pool);
    expect((await agentFor(app).post("/api/auth/register").send(registration)).status).toBe(201);
    const customer = agentFor(app);
    expect((await customer.post("/api/auth/login").send({
      username: registration.username,
      password: registration.password,
    })).status).toBe(200);
    const tenant = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE reference_code <> 'internal'");
    await pool.query("UPDATE tenants SET status = 'TRIAL', trial_started_at = now() - interval '4 days', trial_ends_at = now() - interval '1 day' WHERE id = $1", [tenant.rows[0].id]);
    expect((await customer.get("/api/patients")).status).toBe(403);
    expect((await customer.get("/api/commercial/status")).status).toBe(200);
    const first = await customer.post("/api/commercial/activation-requests").send({ note: "please" });
    const second = await customer.post("/api/commercial/activation-requests").send({ note: "again" });
    expect(first.status).toBe(201);
    expect(second.status).toBe(200);
    expect(second.body.request.id).toBe(first.body.request.id);
  });

  it("denies customer admins and lets explicit platform admins activate, suspend, and extend", async () => {
    await freshAdminSession(app, pool);
    expect((await agentFor(app).post("/api/auth/register").send(registration)).status).toBe(201);
    const customer = agentFor(app);
    expect((await customer.post("/api/auth/login").send({
      username: registration.username,
      password: registration.password,
    })).status).toBe(200);
    expect((await customer.get("/api/platform-admin/tenants")).status).toBe(403);
    const platform = agentFor(app);
    await platform.post("/api/auth/login").send({
      username: "platform-admin",
      password: "Passw0rd1234",
    });
    const tenant = await pool.query<{ id: string }>("SELECT id FROM tenants WHERE reference_code <> 'internal'");
    expect((await platform.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/activate`)).status).toBe(200);
    expect((await platform.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/suspend`)).status).toBe(200);
    expect((await platform.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/extend-trial`).send({ days: 3 })).status).toBe(200);
  });

  it("treats activated tenants as permanent, keeps them operational after trial dates pass, and reactivates them as active", async () => {
    await freshAdminSession(app, pool);
    expect((await agentFor(app).post("/api/auth/register").send(registration)).status).toBe(201);

    const customer = agentFor(app);
    expect((await customer.post("/api/auth/login").send({
      username: registration.username,
      password: registration.password,
    })).status).toBe(200);

    const platform = agentFor(app);
    await platform.post("/api/auth/login").send({
      username: "platform-admin",
      password: "Passw0rd1234",
    });

    const tenant = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE reference_code <> 'internal'",
    );
    const tenantId = tenant.rows[0].id;

    const activated = await platform.post(`/api/platform-admin/tenants/${tenantId}/activate`);
    expect(activated.status).toBe(200);
    expect(activated.body.tenant.status).toBe("ACTIVE");
    expect(activated.body.tenant.activatedAt).toEqual(expect.any(String));

    await pool.query(
      "UPDATE tenants SET trial_ends_at = now() - interval '1 day' WHERE id = $1",
      [tenantId],
    );
    expect((await customer.get("/api/patients")).status).toBe(200);
    expect(
      (await platform.post(`/api/platform-admin/tenants/${tenantId}/extend-trial`).send({ days: 3 })).body.code,
    ).toBe("ACTIVE_TENANT_PERMANENT");

    expect((await platform.post(`/api/platform-admin/tenants/${tenantId}/suspend`)).status).toBe(200);
    expect((await customer.get("/api/patients")).body.code).toBe("TENANT_SUSPENDED");

    const reactivated = await platform.post(`/api/platform-admin/tenants/${tenantId}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.tenant.status).toBe("ACTIVE");
    expect((await customer.get("/api/patients")).status).toBe(200);

    const trials = await platform.get("/api/platform-admin/trials?view=active");
    expect(trials.status).toBe(200);
    expect(trials.body.items.some((item: { id: string }) => item.id === tenantId)).toBe(false);
  });
});