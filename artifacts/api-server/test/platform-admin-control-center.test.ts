import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  agentFor,
  freshAdminSession,
  login,
  makePool,
} from "./helpers";

const pool = makePool();
let clinicAdmin: ReturnType<typeof agentFor>;

beforeEach(async () => {
  clinicAdmin = await freshAdminSession(app, pool);
});

afterAll(async () => {
  await pool.end();
});

describe("platform admin control center", () => {
  it("enforces platform authority, exposes operational data only, and persists workflows", async () => {
    expect((await agentFor(app).get("/api/platform-admin/overview")).status).toBe(401);
    const forbidden = await clinicAdmin.get("/api/platform-admin/overview");
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.code).toBe("PLATFORM_ADMIN_REQUIRED");

    const platformAdmin = agentFor(app);
    await login(platformAdmin, "platform-admin", ADMIN_PASSWORD);
    const preferences = await platformAdmin
      .patch("/api/preferences")
      .send({ locale: "en" });
    expect(preferences.status).toBe(200);
    expect(preferences.body.preferences.locale).toBe("en");
    const preferenceErrors = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM system_errors
       WHERE route = '/api/preferences' AND method = 'PATCH'`,
    );
    expect(preferenceErrors.rows[0].count).toBe(0);
    const platformUser = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE username = 'platform-admin'",
    );
    const userId = platformUser.rows[0].id;
    const tenant = await pool.query<{ id: string }>(
      `INSERT INTO tenants (
         reference_code, name, contact_name, contact_phone, status,
         trial_started_at, trial_ends_at
       ) VALUES (
         'clinic-control-center', 'Control Center Clinic', 'Owner',
         '0500000000', 'TRIAL', now(), now() + interval '12 hours'
       ) RETURNING id`,
    );
    const tenantId = tenant.rows[0].id;
    const clinicUser = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE username = 'admin'",
    );
    await pool.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active)
       VALUES ($1, $2, 'ADMIN', true)`,
      [tenantId, clinicUser.rows[0].id],
    );
    await pool.query(
      `INSERT INTO patients (
         tenant_id, file_number, full_name, full_name_normalized
       ) VALUES ($1, 'P-PRIVATE', 'PRIVATE PATIENT NAME', 'private patient name')`,
      [tenantId],
    );
    const request = await pool.query<{ id: string }>(
      `INSERT INTO tenant_activation_requests (
         tenant_id, requested_by_user_id, note
       ) VALUES ($1, $2, 'Please activate') RETURNING id`,
      [tenantId, userId],
    );
    const error = await pool.query<{ id: string }>(
      `INSERT INTO system_errors (
         reference_code, tenant_id, route, method, error_type,
         safe_message, environment, application_version
       ) VALUES (
         'GH-ERR-TEST-001', $1, '/api/test', 'GET', 'TestError',
         'Safe test message', 'test', 'test'
       ) RETURNING id`,
      [tenantId],
    );
    await pool.query(
      `INSERT INTO audit_logs (user_id, tenant_id, action, summary)
       VALUES ($1, $2, 'platform_tenant_activate', 'Activated customer')`,
      [userId, tenantId],
    );

    const overview = await platformAdmin.get("/api/platform-admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.metrics.totalCustomers).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(overview.body)).not.toContain("PRIVATE PATIENT NAME");
    expect(JSON.stringify(overview.body)).not.toContain("P-PRIVATE");
    expect(overview.body.metrics).toMatchObject({
      totalCustomers: expect.any(Number),
      activeCustomers: expect.any(Number),
      trialCustomers: expect.any(Number),
      expiringTrials: expect.any(Number),
      expiredTrials: expect.any(Number),
      suspendedCustomers: expect.any(Number),
      newToday: expect.any(Number),
      newThisMonth: expect.any(Number),
      openActivationRequests: expect.any(Number),
      openSystemErrors: expect.any(Number),
    });
    expect(overview.body.recentActivations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "platform_tenant_activate",
        tenant: expect.objectContaining({ id: tenantId }),
      }),
    ]));
    expect(overview.body).not.toHaveProperty("recentActivationRequests");

    const detail = await platformAdmin.get(`/api/platform-admin/tenants/${tenantId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.tenant.userCount).toBe(1);
    expect(detail.body.tenant.usage.patientCount).toBe(1);
    expect(JSON.stringify(detail.body)).not.toContain("PRIVATE PATIENT NAME");
    expect(JSON.stringify(detail.body)).not.toContain("P-PRIVATE");
    const customers = await platformAdmin.get("/api/platform-admin/tenants");
    const customer = customers.body.items.find((item: { id: string }) => item.id === tenantId);
    expect(customer.userCount).toBe(detail.body.tenant.userCount);

    const workflow = await platformAdmin
      .patch(`/api/platform-admin/activation-requests/${request.rows[0].id}`)
      .send({ workflowStatus: "AWAITING_PAYMENT" });
    expect(workflow.status).toBe(200);
    expect(workflow.body.request.workflowStatus).toBe("AWAITING_PAYMENT");

    const resolved = await platformAdmin
      .patch(`/api/platform-admin/errors/${error.rows[0].id}`)
      .send({ resolved: true, note: "Checked" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.error.isResolved).toBe(true);

    const settings = await platformAdmin.patch("/api/platform-admin/settings").send({
      supportWhatsapp: "0500000000",
      supportPhone: "0110000000",
      supportEmail: "support@example.test",
      defaultTrialHours: 96,
    });
    expect(settings.status).toBe(200);
    expect(settings.body.settings.defaultTrialHours).toBe(96);
    const loaded = await platformAdmin.get("/api/platform-admin/settings");
    expect(loaded.body.settings.supportEmail).toBe("support@example.test");

    const invalidSettings = await platformAdmin.patch("/api/platform-admin/settings").send({
      supportWhatsapp: "not-a-phone",
      supportPhone: "12",
      supportEmail: "not-an-email",
      defaultTrialHours: 24.5,
    });
    expect(invalidSettings.status).toBe(400);

    const registrationSuffix = randomUUID().slice(0, 8);
    const futureTenantName = `Future Default Clinic ${registrationSuffix}`;
    const registration = await agentFor(app).post("/api/auth/register").send({
      tenantName: futureTenantName,
      ownerName: "Future Owner",
      username: `future-owner-${registrationSuffix}`,
      phone: "0501234567",
      cityDisplayName: "Riyadh",
      password: ADMIN_PASSWORD,
      confirmPassword: ADMIN_PASSWORD,
      locale: "en",
    });
    expect(registration.status).toBe(201);
    const futureTenant = await pool.query<{
      trial_started_at: Date;
      trial_ends_at: Date;
    }>(
      `SELECT trial_started_at, trial_ends_at
       FROM tenants WHERE name = $1`,
      [futureTenantName],
    );
    const durationHours = (
      futureTenant.rows[0].trial_ends_at.getTime()
      - futureTenant.rows[0].trial_started_at.getTime()
    ) / 3_600_000;
    expect(durationHours).toBe(96);

    const health = await platformAdmin.get("/api/platform-admin/health");
    expect(health.status).toBe(200);
    expect(health.body.components.storage).toMatchObject({
      status: "healthy",
      messageCode: "storageDatabaseBacked",
    });
    expect(health.body.components.schema).toMatchObject({
      status: "healthy",
      messageCode: "schemaCurrentJournalReadable",
      value: 25,
    });
    for (const component of Object.values(health.body.components) as Array<Record<string, unknown>>) {
      expect(component.messageCode).toEqual(expect.any(String));
      expect(component).not.toHaveProperty("message");
    }

    const internal = await pool.query<{ id: string }>(
      "SELECT id FROM tenants WHERE is_internal = true",
    );
    const internalTenantId = internal.rows[0].id;
    const internalRequest = await pool.query<{ id: string }>(
      `INSERT INTO tenant_activation_requests (
         tenant_id, requested_by_user_id, note
       ) VALUES ($1, $2, 'must stay outside commercial workflows') RETURNING id`,
      [internalTenantId, userId],
    );
    expect((await platformAdmin.get(`/api/platform-admin/tenants/${internalTenantId}`)).status).toBe(404);
    const filteredCustomers = await platformAdmin.get("/api/platform-admin/tenants");
    expect(filteredCustomers.body.items.some((item: { id: string }) => item.id === internalTenantId)).toBe(false);
    const filteredRequests = await platformAdmin.get("/api/platform-admin/activation-requests");
    expect(filteredRequests.body.items.some(
      (item: { request: { id: string } }) => item.request.id === internalRequest.rows[0].id,
    )).toBe(false);
    const internalWorkflowUpdate = await platformAdmin
      .patch(`/api/platform-admin/activation-requests/${internalRequest.rows[0].id}`)
      .send({ workflowStatus: "CONTACTED" });
    expect(internalWorkflowUpdate.status).toBe(404);
    const internalCommercialRequest = await clinicAdmin
      .post("/api/commercial/activation-requests")
      .send({ note: "not allowed" });
    expect(internalCommercialRequest.status).toBe(403);
    expect(internalCommercialRequest.body.code).toBe("INTERNAL_TENANT_ACTIVATION_FORBIDDEN");
  });
});