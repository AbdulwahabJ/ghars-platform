import { afterAll, beforeEach, describe, expect, it } from "vitest";
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

    const overview = await platformAdmin.get("/api/platform-admin/overview");
    expect(overview.status).toBe(200);
    expect(overview.body.metrics.totalCustomers).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(overview.body)).not.toContain("PRIVATE PATIENT NAME");
    expect(JSON.stringify(overview.body)).not.toContain("P-PRIVATE");

    const detail = await platformAdmin.get(`/api/platform-admin/tenants/${tenantId}`);
    expect(detail.status).toBe(200);
    expect(detail.body.tenant.usage.patientCount).toBe(1);
    expect(JSON.stringify(detail.body)).not.toContain("PRIVATE PATIENT NAME");
    expect(JSON.stringify(detail.body)).not.toContain("P-PRIVATE");

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
  });
});