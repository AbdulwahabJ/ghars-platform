import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { db } from "@workspace/db";
import app from "../src/app";
import { registrationUniqueConflict } from "../src/routes/auth";
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

let registrationIp = 1;
function postRegistration(
  payload: Record<string, unknown>,
  ip = `198.51.100.${registrationIp++}`,
) {
  return agentFor(app)
    .post("/api/auth/register")
    .set("X-Forwarded-For", ip)
    .send(payload);
}

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
    const res = await postRegistration(registration);
    expect(res.status).toBe(201);
    const count = await pool.query("SELECT count(*)::int AS count FROM tenants WHERE reference_code <> 'internal'");
    expect(count.rows[0].count).toBe(1);
  });

  it("starts the 72-hour trial atomically at registration", async () => {
    expect((await postRegistration(registration)).status).toBe(201);
    const tenant = await pool.query("SELECT status, trial_started_at, trial_ends_at, contact_phone FROM tenants WHERE contact_phone = '966551234567'");
    expect(tenant.rows[0].status).toBe("TRIAL");
    expect(tenant.rows[0].contact_phone).toBe("966551234567");
    expect(new Date(tenant.rows[0].trial_ends_at).getTime() - new Date(tenant.rows[0].trial_started_at).getTime()).toBe(72 * 60 * 60 * 1000);
  });

  it("returns safe field-level codes for unavailable usernames and phones", async () => {
    expect((await postRegistration(registration)).status).toBe(201);

    const usernameConflict = await postRegistration({
      ...registration,
      phone: "0551234568",
    });
    expect(usernameConflict.status).toBe(409);
    expect(usernameConflict.body).toMatchObject({
      code: "USERNAME_UNAVAILABLE",
      field: "username",
    });
    expect(JSON.stringify(usernameConflict.body)).not.toContain("users_username_unique");
    const rolledBackTenant = await pool.query(
      "SELECT id FROM tenants WHERE contact_phone = '966551234568'",
    );
    expect(rolledBackTenant.rowCount).toBe(0);

    const phoneConflict = await postRegistration({
      ...registration,
      username: "another-owner",
    });
    expect(phoneConflict.status).toBe(409);
    expect(phoneConflict.body).toMatchObject({
      code: "TRIAL_NOT_ELIGIBLE",
      field: "phone",
    });
    expect(JSON.stringify(phoneConflict.body)).not.toContain("UQ_tenants_contact_phone");
  });

  it("classifies only known unique constraints through wrapped Drizzle causes", () => {
    expect(registrationUniqueConflict({
      cause: {
        cause: {
          code: "23505",
          constraint: "users_username_unique",
        },
      },
    })).toEqual({ code: "USERNAME_UNAVAILABLE", field: "username" });
    expect(registrationUniqueConflict({
      cause: {
        code: "23505",
        constraint: "UQ_tenants_contact_phone",
      },
    })).toEqual({ code: "PHONE_UNAVAILABLE", field: "phone" });
    expect(registrationUniqueConflict({
      code: "23505",
      constraint: "unknown_unique_constraint",
      message: "users_username_unique",
    })).toBeUndefined();
  });

  it.each([
    ["missing organization name", { tenantName: "" }, "INVALID_ORGANIZATION_NAME", "tenantName"],
    ["invalid username", { username: "اسم عربي" }, "INVALID_USERNAME", "username"],
    ["invalid phone", { phone: "12345" }, "INVALID_PHONE", "phone"],
    ["weak password", { password: "short1", confirmPassword: "short1" }, "WEAK_PASSWORD", "password"],
    ["password mismatch", { confirmPassword: "Different1234" }, "PASSWORDS_DO_NOT_MATCH", "confirmPassword"],
  ])("returns a structured validation error for %s", async (_label, patch, code, field) => {
    const res = await postRegistration({ ...registration, ...patch });
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code, field });
    expect(res.body.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ code, field })]),
    );
  });

  it("returns a safe localized-ready fallback for unexpected registration failures", async () => {
    const transaction = vi
      .spyOn(db, "transaction")
      .mockRejectedValueOnce(new Error("sensitive internal detail"));
    try {
      const res = await postRegistration(registration);
      expect(res.status).toBe(500);
      expect(res.body.code).toBe("INTERNAL");
      expect(JSON.stringify(res.body)).not.toContain("sensitive internal detail");
    } finally {
      transaction.mockRestore();
    }
  });

  it("returns RATE_LIMITED after repeated registration attempts", async () => {
    const ip = "203.0.113.240";
    for (let attempt = 0; attempt < 5; attempt++) {
      expect((await postRegistration({ ...registration, tenantName: "" }, ip)).status).toBe(400);
    }
    const limited = await postRegistration({ ...registration, tenantName: "" }, ip);
    expect(limited.status).toBe(429);
    expect(limited.body.code).toBe("RATE_LIMITED");
  });

  it("keeps commercial status available for an expired tenant and deduplicates activation requests", async () => {
    await freshAdminSession(app, pool);
    expect((await postRegistration(registration)).status).toBe(201);
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

  it("denies customer admins and lets explicit platform admins extend trials and manage permanent activation", async () => {
    await freshAdminSession(app, pool);
    expect((await postRegistration(registration)).status).toBe(201);
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
    expect((await platform.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/extend-trial`).send({ days: 3 })).status).toBe(200);
    expect((await platform.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/activate`)).status).toBe(200);
    expect((await platform.post(`/api/platform-admin/tenants/${tenant.rows[0].id}/suspend`)).status).toBe(200);
    const permanentExtension = await platform
      .post(`/api/platform-admin/tenants/${tenant.rows[0].id}/extend-trial`)
      .send({ days: 3 });
    expect(permanentExtension.status).toBe(409);
    expect(permanentExtension.body.code).toBe("ACTIVE_TENANT_PERMANENT");
  });

  it("treats activated tenants as permanent, keeps them operational after trial dates pass, and reactivates them as active", async () => {
    await freshAdminSession(app, pool);
    expect((await postRegistration(registration)).status).toBe(201);

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
    const historicalTrial = await pool.query<{ trial_ends_at: Date }>(
      "SELECT trial_ends_at FROM tenants WHERE id = $1",
      [tenantId],
    );
    expect((await customer.get("/api/patients")).status).toBe(200);
    const activeExtension = await platform
      .post(`/api/platform-admin/tenants/${tenantId}/extend-trial`)
      .send({ days: 3 });
    expect(activeExtension.status).toBe(409);
    expect(activeExtension.body.code).toBe("ACTIVE_TENANT_PERMANENT");

    expect((await platform.post(`/api/platform-admin/tenants/${tenantId}/suspend`)).status).toBe(200);
    expect((await customer.get("/api/patients")).body.code).toBe("TENANT_SUSPENDED");
    const suspendedExtension = await platform
      .post(`/api/platform-admin/tenants/${tenantId}/extend-trial`)
      .send({ days: 3 });
    expect(suspendedExtension.status).toBe(409);
    expect(suspendedExtension.body.code).toBe("ACTIVE_TENANT_PERMANENT");

    const reactivated = await platform.post(`/api/platform-admin/tenants/${tenantId}/reactivate`);
    expect(reactivated.status).toBe(200);
    expect(reactivated.body.tenant.status).toBe("ACTIVE");
    expect((await customer.get("/api/patients")).status).toBe(200);
    const afterReactivation = await pool.query<{ status: string; trial_ends_at: Date }>(
      "SELECT status, trial_ends_at FROM tenants WHERE id = $1",
      [tenantId],
    );
    expect(afterReactivation.rows[0].status).toBe("ACTIVE");
    expect(afterReactivation.rows[0].trial_ends_at.getTime())
      .toBe(historicalTrial.rows[0].trial_ends_at.getTime());

    const activationDate = new Date(reactivated.body.tenant.activatedAt).getTime();
    const repeatedActivation = await platform.post(`/api/platform-admin/tenants/${tenantId}/activate`);
    expect(repeatedActivation.status).toBe(200);
    expect(new Date(repeatedActivation.body.tenant.activatedAt).getTime()).toBe(activationDate);

    for (const view of ["active", "expiring", "expired"]) {
      const trials = await platform.get(`/api/platform-admin/trials?view=${view}`);
      expect(trials.status).toBe(200);
      expect(trials.body.items.some((item: { id: string }) => item.id === tenantId)).toBe(false);
    }
  });
});