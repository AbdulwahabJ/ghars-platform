import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  agentFor,
  freshAdminSession,
  login,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let tenantA: TestAgent;
let tenantB: TestAgent;
let tenantBId: string;
let tenantBUserId: string;
let patientAId: string;
let patientBId: string;

beforeAll(async () => {
  tenantA = await freshAdminSession(app, pool);
  // This suite exercises the legacy CSV isolation behavior, so explicitly
  // opt into the production feature gate after the fresh database reset.
  await pool.query(
    `INSERT INTO platform_settings (id, legacy_import_enabled, updated_at)
     VALUES ('global', true, now())
     ON CONFLICT (id) DO UPDATE SET legacy_import_enabled = true, updated_at = now()`,
  );

  const tenant = await pool.query<{ id: string }>(
    `INSERT INTO tenants
       (reference_code, name, locale, status, activated_at)
     VALUES ('clinic-b', 'Clinic B', 'en', 'ACTIVE', now())
     RETURNING id`,
  );
  tenantBId = tenant.rows[0].id;

  const user = await pool.query<{ id: string }>(
    `INSERT INTO users
       (username, email, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4, 'ADMIN')
     RETURNING id`,
    [
      "clinic-b-admin",
      "clinic-b@example.test",
      bcrypt.hashSync(ADMIN_PASSWORD, 10),
      "Clinic B Admin",
    ],
  );
  tenantBUserId = user.rows[0].id;
  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role)
     VALUES ($1, $2, 'ADMIN')`,
    [tenantBId, user.rows[0].id],
  );

  tenantB = agentFor(app);
  await login(tenantB, "clinic-b-admin");
});

afterAll(async () => {
  await pool.end();
});

describe("tenant isolation", () => {
  it("returns the server-derived current tenant at login", async () => {
    const a = await tenantA.get("/api/auth/me");
    const b = await tenantB.get("/api/auth/me");

    expect(a.status).toBe(200);
    expect(a.body.currentTenant.referenceCode).toBe("internal");
    expect(b.status).toBe(200);
    expect(b.body.currentTenant.referenceCode).toBe("clinic-b");
    expect(b.body.isPlatformAdmin).toBe(false);
  });

  it("allows the same file number in different tenants", async () => {
    const a = await tenantA.post("/api/patients").send({
      fileNumber: "SHARED-100",
      fullName: "مريض العيادة الأولى",
    });
    const b = await tenantB.post("/api/patients").send({
      fileNumber: "SHARED-100",
      fullName: "Clinic B Patient",
    });

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    patientAId = a.body.patient.id;
    patientBId = b.body.patient.id;
  });

  it("isolates list and direct-ID reads", async () => {
    const listA = await tenantA.get("/api/patients");
    const listB = await tenantB.get("/api/patients");

    expect(listA.status).toBe(200);
    expect(listA.body.items.map((item: { id: string }) => item.id)).toEqual([
      patientAId,
    ]);
    expect(listB.status).toBe(200);
    expect(listB.body.items.map((item: { id: string }) => item.id)).toEqual([
      patientBId,
    ]);

    const aReadsB = await tenantA.get(`/api/patients/${patientBId}`);
    const bReadsA = await tenantB.get(`/api/patients/${patientAId}`);
    expect(aReadsB.status).toBe(404);
    expect(bReadsA.status).toBe(404);
  });

  it("isolates dashboard statistics and tenant admin users", async () => {
    const range = "from=2020-01-01&to=2030-12-31";
    const statsA = await tenantA.get(`/api/statistics?${range}`);
    const statsB = await tenantB.get(`/api/statistics?${range}`);
    const dashboardA = await tenantA.get("/api/dashboard");
    const dashboardB = await tenantB.get("/api/dashboard");
    expect(statsA.status).toBe(200);
    expect(statsB.status).toBe(200);
    expect(dashboardA.status).toBe(200);
    expect(dashboardB.status).toBe(200);
    expect(dashboardA.body.kpis.activePatients).toBe(1);
    expect(dashboardB.body.kpis.activePatients).toBe(1);

    const usersB = await tenantB.get("/api/admin/users");
    expect(usersB.status).toBe(200);
    expect(
      usersB.body.users.map((user: { username: string }) => user.username),
    ).toEqual(["clinic-b-admin"]);
  });

  it("rejects a foreign default follow-up assignee", async () => {
    const response = await tenantA.patch("/api/admin/settings").send({
      defaultFollowupAssigneeUserId: tenantBUserId,
    });
    expect(response.status).toBe(422);
    expect(response.body.code).toBe("INVALID_ASSIGNEE");
  });

  it("excludes tenant B null-case communications from tenant A reports", async () => {
    await pool.query(
      `INSERT INTO communications
       (tenant_id, patient_id, communication_reason, communication_result, opened_at)
       VALUES ($1, $2, 'B-only reason', 'B-only result', now())`,
      [tenantBId, patientBId],
    );
    const response = await tenantA.get(
      "/api/statistics?from=2020-01-01&to=2030-12-31",
    );
    expect(response.status).toBe(200);
    expect(JSON.stringify(response.body)).not.toContain("B-only reason");
    expect(JSON.stringify(response.body)).not.toContain("B-only result");
  });

  it("deactivates a shared membership without invalidating its B session", async () => {
    const internal = await pool.query<{ id: string }>(
      `SELECT id FROM tenants WHERE reference_code = 'internal'`,
    );
    await pool.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'DOCTOR')`,
      [internal.rows[0].id, tenantBUserId],
    );

    const users = await tenantA.get("/api/admin/users");
    const target = users.body.users.find(
      (user: { id: string }) => user.id === tenantBUserId,
    );
    expect(target).toBeTruthy();
    const deactivate = await tenantA.post(
      `/api/admin/users/${tenantBUserId}/deactivate`,
    );
    expect(deactivate.status).toBe(200);

    const membership = await pool.query<{ is_active: boolean }>(
      `SELECT is_active FROM tenant_memberships WHERE tenant_id = $1 AND user_id = $2`,
      [tenantBId, tenantBUserId],
    );
    expect(membership.rows[0].is_active).toBe(true);
    const bSession = await tenantB.get("/api/auth/me");
    expect(bSession.status).toBe(200);
    expect(bSession.body.currentTenant.id).toBe(tenantBId);
  });

  it("rejects a follow-up CSV assignee that belongs only to tenant B", async () => {
    const createdCase = await tenantA
      .post(`/api/patients/${patientAId}/implant-cases`)
      .send({ treatingDoctor: "A Doctor", caseStatus: "تمت الزراعة", procedureDate: "2025-01-01" });
    expect(createdCase.status).toBe(201);
    const csv = [
      "رقم ملف المريض,تاريخ العملية,نوع المتابعة,موعد المتابعة,الحالة,اسم المستخدم المسؤول,ملاحظة",
      `SHARED-100,2025-01-01,متابعة دورية,2025-02-01 10:00,مجدولة,clinic-b-admin,foreign`,
    ].join("\n");
    const preview = await tenantA.post("/api/admin/import/preview").send({
      type: "followups",
      content: csv,
      mode: "create_only",
    });
    expect(preview.status).toBe(200);
    expect(preview.body.invalidRows).toBe(1);
    expect(preview.body.rows[0].errors.join(" ")).toContain("clinic-b-admin");
    const count = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count FROM followups
       WHERE tenant_id = (SELECT id FROM tenants WHERE reference_code = 'internal')
         AND assigned_user_id = $1`,
      [tenantBUserId],
    );
    expect(count.rows[0].count).toBe(0);
  });

  it("blocks an expired trial without deleting tenant data", async () => {
    await pool.query(
      `UPDATE tenants
       SET status = 'TRIAL',
           trial_started_at = now() - interval '4 days',
           trial_ends_at = now() - interval '1 day',
           activated_at = NULL
       WHERE id = $1`,
      [tenantBId],
    );

    const blocked = await tenantB.get("/api/patients");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("TENANT_TRIAL_EXPIRED");

    const me = await tenantB.get("/api/auth/me");
    expect(me.status).toBe(200);
    expect(me.body.currentTenant.status).toBe("TRIAL");

    const count = await pool.query<{ count: number }>(
      `SELECT count(*)::int AS count
       FROM patients
       WHERE tenant_id = $1`,
      [tenantBId],
    );
    expect(count.rows[0].count).toBe(1);
  });
});