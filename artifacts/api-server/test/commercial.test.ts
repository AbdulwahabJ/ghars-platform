import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { vi } from "vitest";
import { db, tenantsTable } from "@workspace/db";
import app from "../src/app";
import {
  bootstrapTenantDefaults,
  DEFAULT_IMPLANT_SYSTEMS,
  DEFAULT_LOOKUP_OPTIONS,
  DEFAULT_WHATSAPP_TEMPLATES,
} from "../src/lib/tenant-bootstrap";
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

function registrationFor(
  suffix: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    tenantName: `Clinic ${suffix}`,
    ownerName: `Owner ${suffix}`,
    username: `owner-${suffix.toLowerCase()}`,
    phone: "501234567",
    countryCode: "SA",
    phoneCountryCode: "SA",
    cityDisplayName: "Riyadh",
    password: "Passw0rd1234",
    confirmPassword: "Passw0rd1234",
    locale: "en",
    ...overrides,
  };
}

const EXPECTED_LOOKUP_DEFAULTS: Record<string, string[]> = {
  q_value: ["0", "5", "10", "15", "20", "25", "30", "35", "40", "45", "50", "70", "75", "80"],
  former_value: ["N", "Y", "M17", "M30", "MST", "ST", "MU15", "MU17", "MU30", "MUST"],
  graft_value: ["N", "Y", "ALLO"],
  procedure_tag: ["DIRECT", "IMMED", "FLAPLESS", "Sas101", "R.R", "F", "مؤقت", "مخصص"],
  bone_graft_procedure_type: ["ترقيع عظمي", "رفع جيب أنفي", "توسيع العظم"],
  bone_graft_material: ["عظم ذاتي", "عظم صناعي", "عظم بشري معالج"],
  bone_graft_membrane: ["غشاء كولاجين", "غشاء غير ممتص"],
  bone_graft_status: ["مخطط", "تم", "ملغى"],
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

  it.each([
    ["sa-makkah", "SA", "Makkah", "SA", "501234567", "makkah", "+966501234567"],
    ["sa-jeddah", "SA", "Jeddah", "SA", "501234568", "jeddah", "+966501234568"],
    ["ae-dubai", "AE", "Dubai", "AE", "501234567", "dubai", "+971501234567"],
    ["jo-amman", "JO", "Amman", "JO", "790123456", "amman", "+962790123456"],
  ])(
    "stores canonical registration location and E.164 phone for %s",
    async (suffix, countryCode, cityDisplayName, phoneCountryCode, phone, normalizedCity, e164) => {
      const res = await postRegistration(registrationFor(suffix, {
        countryCode,
        cityDisplayName,
        phoneCountryCode,
        phone,
      }));
      expect(res.status).toBe(201);
      const row = await pool.query<{
        country_code: string;
        city_name_normalized: string;
        city_display_name: string;
        phone_e164: string;
        phone_country_code: string;
        contact_phone: string;
        city: string;
      }>(
        `SELECT country_code, city_name_normalized, city_display_name,
                phone_e164, phone_country_code, contact_phone, city
           FROM tenants WHERE reference_code LIKE $1`,
        [`clinic-%`],
      );
      const tenant = row.rows.find((candidate) => candidate.city_display_name === cityDisplayName);
      expect(tenant).toMatchObject({
        country_code: countryCode,
        city_name_normalized: normalizedCity,
        city_display_name: cityDisplayName,
        phone_e164: e164,
        phone_country_code: phoneCountryCode,
        contact_phone: e164.slice(1),
        city: cityDisplayName,
      });
    },
  );

  it("allows a Saudi organization to use a manually selected UAE phone country", async () => {
    const res = await postRegistration(registrationFor("manual-ae", {
      countryCode: "SA",
      cityDisplayName: "Riyadh",
      phoneCountryCode: "AE",
      phone: "501234569",
    }));
    expect(res.status).toBe(201);
    const row = await pool.query(
      `SELECT country_code, city_name_normalized, phone_e164, phone_country_code,
              contact_phone, city
         FROM tenants WHERE city_display_name = 'Riyadh'`,
    );
    expect(row.rows[0]).toMatchObject({
      country_code: "SA",
      city_name_normalized: "riyadh",
      phone_e164: "+971501234569",
      phone_country_code: "AE",
      contact_phone: "971501234569",
      city: "Riyadh",
    });
  });

  it("rejects an invalid selected-country phone with a phone field error", async () => {
    const res = await postRegistration(registrationFor("invalid-phone", {
      phone: "123",
      phoneCountryCode: "SA",
    }));
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ field: "phone", code: "INVALID_PHONE" });
  });

  it("starts the 72-hour trial atomically at registration", async () => {
    expect((await postRegistration(registration)).status).toBe(201);
    const tenant = await pool.query("SELECT status, trial_started_at, trial_ends_at, contact_phone, city FROM tenants WHERE contact_phone = '966551234567'");
    expect(tenant.rows[0].status).toBe("TRIAL");
    expect(tenant.rows[0].contact_phone).toBe("966551234567");
    expect(tenant.rows[0].city).toBe("Riyadh");
    expect(new Date(tenant.rows[0].trial_ends_at).getTime() - new Date(tenant.rows[0].trial_started_at).getTime()).toBe(72 * 60 * 60 * 1000);
  });

  it("bootstraps the exact tenant defaults without clinical/demo rows", async () => {
    expect((await postRegistration(registration)).status).toBe(201);
    const tenant = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE contact_phone = '966551234567'",
    );
    const tenantId = tenant.rows[0].id;

    const [membership, systems, lookups, templates, clinicalCounts] = await Promise.all([
      pool.query<{ role: string }>(
        "SELECT role FROM tenant_memberships WHERE tenant_id = $1",
        [tenantId],
      ),
      pool.query<{ name: string }>(
        "SELECT name FROM implant_system_options WHERE tenant_id = $1 ORDER BY sort_order",
        [tenantId],
      ),
      pool.query<{ category: string; value: string }>(
        "SELECT category, value FROM lookup_options WHERE tenant_id = $1 ORDER BY category, sort_order",
        [tenantId],
      ),
      pool.query<{ name: string; body: string; is_approved: boolean }>(
        "SELECT name, body, is_approved FROM whatsapp_templates WHERE tenant_id = $1 ORDER BY sort_order",
        [tenantId],
      ),
      pool.query<{ table_name: string; count: number }>(`
        SELECT 'patients' AS table_name, count(*)::int AS count FROM patients WHERE tenant_id = $1
        UNION ALL SELECT 'implant_cases', count(*)::int FROM implant_cases WHERE tenant_id = $1
        UNION ALL SELECT 'implants', count(*)::int FROM implants WHERE tenant_id = $1
        UNION ALL SELECT 'followups', count(*)::int FROM followups WHERE tenant_id = $1
        UNION ALL SELECT 'communications', count(*)::int FROM communications WHERE tenant_id = $1
      `, [tenantId]),
    ]);

    expect(membership.rows).toEqual([{ role: "ADMIN" }]);
    expect(systems.rows.map((row) => row.name)).toEqual([...DEFAULT_IMPLANT_SYSTEMS]);
    expect(lookups.rows).toHaveLength(46);
    expect(new Set(lookups.rows.map((row) => row.category))).toEqual(
      new Set(Object.keys(EXPECTED_LOOKUP_DEFAULTS)),
    );
    for (const [category, expectedValues] of Object.entries(EXPECTED_LOOKUP_DEFAULTS)) {
      expect(lookups.rows.filter((row) => row.category === category).map((row) => row.value))
        .toEqual(expectedValues);
    }
    expect(DEFAULT_LOOKUP_OPTIONS).toHaveLength(46);
    const keyStats = await pool.query<{
      systems: number;
      lookups: number;
      templates: number;
      distinct_keys: number;
    }>(
      `SELECT
         (SELECT count(*)::int FROM implant_system_options WHERE tenant_id = $1 AND bootstrap_key IS NOT NULL) AS systems,
         (SELECT count(*)::int FROM lookup_options WHERE tenant_id = $1 AND bootstrap_key IS NOT NULL) AS lookups,
         (SELECT count(*)::int FROM whatsapp_templates WHERE tenant_id = $1 AND bootstrap_key IS NOT NULL) AS templates,
         (SELECT count(DISTINCT bootstrap_key)::int
            FROM (
              SELECT bootstrap_key FROM implant_system_options WHERE tenant_id = $1
              UNION ALL SELECT bootstrap_key FROM lookup_options WHERE tenant_id = $1
              UNION ALL SELECT bootstrap_key FROM whatsapp_templates WHERE tenant_id = $1
            ) AS all_defaults) AS distinct_keys`,
      [tenantId],
    );
    expect(keyStats.rows[0]).toEqual({
      systems: 10,
      lookups: 46,
      templates: 12,
      distinct_keys: 68,
    });
    expect(templates.rows.map(({ name, body }) => ({ name, body }))).toEqual(
      DEFAULT_WHATSAPP_TEMPLATES.map(({ name, body }) => ({ name, body })),
    );
    expect(templates.rows.every((row) => row.is_approved)).toBe(true);
    expect(templates.rows).toHaveLength(12);
    for (const row of templates.rows) {
      expect(row.body).toContain("Hello");
      expect(row.body).toContain("مرحبًا");
      expect(row.body).not.toMatch(/مجمع|د\.\s*همام|مبلغ|clinic|doctor|balance/i);
      expect([...row.body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)].every(
        (match) => ["patientName", "date", "time"].includes(match[1] ?? ""),
      )).toBe(true);
    }
    expect(clinicalCounts.rows.every((row) => row.count === 0)).toBe(true);
  });

  it("keeps tenant bootstrap idempotent under repeated concurrent calls", async () => {
    expect((await postRegistration(registration)).status).toBe(201);
    const tenant = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE contact_phone = '966551234567'",
    );
    const tenantId = tenant.rows[0].id;

    await Promise.all([
      db.transaction((tx) => bootstrapTenantDefaults(tx, tenantId)),
      db.transaction((tx) => bootstrapTenantDefaults(tx, tenantId)),
      db.transaction((tx) => bootstrapTenantDefaults(tx, tenantId)),
    ]);
    await db.transaction((tx) => bootstrapTenantDefaults(tx, tenantId));

    const counts = await pool.query<{ systems: number; lookups: number; templates: number }>(
      `SELECT
         (SELECT count(*)::int FROM implant_system_options WHERE tenant_id = $1) AS systems,
         (SELECT count(*)::int FROM lookup_options WHERE tenant_id = $1) AS lookups,
         (SELECT count(*)::int FROM whatsapp_templates WHERE tenant_id = $1) AS templates`,
      [tenantId],
    );
    expect(counts.rows[0]).toEqual({ systems: 10, lookups: 46, templates: 12 });
  });

  it("keeps default edits and deactivation isolated to their tenant", async () => {
    expect((await postRegistration(registration)).status).toBe(201);
    const tenantA = agentFor(app);
    expect((await tenantA.post("/api/auth/login").send({
      username: registration.username,
      password: registration.password,
    })).status).toBe(200);
    const templatesA = await tenantA.get("/api/admin/whatsapp-templates");
    expect(templatesA.status).toBe(200);
    const firstA = templatesA.body.templates[0];
    expect(
      (await tenantA.patch(`/api/admin/whatsapp-templates/${firstA.id}`).send({
        name: "My Appointment Confirmation",
        body: "مرحبًا {{patientName}}، تم تعديل الرسالة.\nHello {{patientName}}, updated.",
      })).status,
    ).toBe(200);
    expect(
      (await tenantA.post(`/api/admin/whatsapp-templates/${firstA.id}/deactivate`)).status,
    ).toBe(200);
    const lookupsA = await tenantA.get("/api/admin/lookups");
    const qOptionA = lookupsA.body.options.find(
      (option: { category: string }) => option.category === "q_value",
    );
    const systemOptionA = lookupsA.body.options.find(
      (option: { category: string }) => option.category === "implant_system",
    );
    expect(
      (await tenantA.patch(`/api/admin/lookups/q_value/${qOptionA.id}`).send({
        value: "Q edited by tenant A",
      })).status,
    ).toBe(204);
    expect(
      (await tenantA.post(`/api/admin/lookups/q_value/${qOptionA.id}/deactivate`)).status,
    ).toBe(204);
    expect(
      (await tenantA.patch(`/api/admin/lookups/implant_system/${systemOptionA.id}`).send({
        value: "System edited by tenant A",
      })).status,
    ).toBe(204);
    expect(
      (await tenantA.post(`/api/admin/lookups/implant_system/${systemOptionA.id}/deactivate`)).status,
    ).toBe(204);

    const tenantARow = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE contact_phone = '966551234567'",
    );
    await Promise.all([
      db.transaction((tx) => bootstrapTenantDefaults(tx, tenantARow.rows[0].id)),
      db.transaction((tx) => bootstrapTenantDefaults(tx, tenantARow.rows[0].id)),
    ]);

    const second = {
      ...registration,
      tenantName: "Second Clinic",
      username: "second-owner",
      phone: "0551234568",
    };
    expect((await postRegistration(second)).status).toBe(201);
    const tenantB = agentFor(app);
    expect((await tenantB.post("/api/auth/login").send({
      username: second.username,
      password: second.password,
    })).status).toBe(200);
    const templatesB = await tenantB.get("/api/admin/whatsapp-templates");
    expect(templatesB.status).toBe(200);
    expect(templatesB.body.templates).toHaveLength(12);
    expect(templatesB.body.templates.map((template: { name: string }) => template.name))
      .toContain("Appointment Confirmation");
    expect(templatesB.body.templates.map((template: { id: string }) => template.id))
      .not.toContain(firstA.id);

    const templatesAAfter = await tenantA.get("/api/admin/whatsapp-templates");
    const editedA = templatesAAfter.body.templates.find(
      (template: { id: string }) => template.id === firstA.id,
    );
    expect(editedA).toMatchObject({
      name: "My Appointment Confirmation",
      isApproved: false,
    });
    const lookupsAAfter = await tenantA.get("/api/admin/lookups");
    expect(lookupsAAfter.body.options.find(
      (option: { id: string }) => option.id === qOptionA.id,
    )).toMatchObject({ value: "Q edited by tenant A", isActive: false });
    expect(lookupsAAfter.body.options.find(
      (option: { id: string }) => option.id === systemOptionA.id,
    )).toMatchObject({ value: "System edited by tenant A", isActive: false });
    expect(lookupsAAfter.body.options.map((option: { value: string }) => option.value))
      .not.toContain(qOptionA.value);
    expect(lookupsAAfter.body.options.map((option: { value: string }) => option.value))
      .not.toContain(systemOptionA.value);
  });

  it("rolls back the tenant and defaults when bootstrap fails", async () => {
    const referenceCode = `rollback-${Date.now()}`;
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(tenantsTable).values({
          referenceCode,
          name: "Rollback tenant",
          status: "TRIAL",
          trialStartedAt: new Date(),
          trialEndsAt: new Date(Date.now() + 72 * 60 * 60 * 1000),
        });
        // The invalid tenant id makes the first bootstrap insert fail with
        // the tenant foreign key, exercising registration-style atomicity.
        await bootstrapTenantDefaults(tx, "00000000-0000-4000-8000-000000000099");
      }),
    ).rejects.toBeDefined();

    const rolledBack = await pool.query(
      "SELECT id FROM tenants WHERE reference_code = $1",
      [referenceCode],
    );
    expect(rolledBack.rowCount).toBe(0);
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