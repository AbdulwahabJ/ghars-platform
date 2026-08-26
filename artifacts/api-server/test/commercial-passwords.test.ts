import bcrypt from "bcryptjs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  agentFor,
  freshAdminSession,
  makePool,
} from "./helpers";

const pool = makePool();
let tenantAdmin: ReturnType<typeof agentFor>;

beforeEach(async () => {
  tenantAdmin = await freshAdminSession(app, pool);
});

afterAll(async () => {
  await pool.end();
});

describe("commercial password recovery hierarchy", () => {
  it("enforces tenant boundaries, temporary-password change, session revocation, and platform protection", async () => {
    const tenant = await pool.query<{ id: string }>(
      `INSERT INTO tenants (reference_code, name, status, activated_at)
       VALUES ('tenant-a', 'Tenant A', 'ACTIVE', now()) RETURNING id`,
    );
    const tenantId = tenant.rows[0].id;
    const admin = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE username = 'admin'",
    );
    const platformAdmin = await pool.query<{ id: string }>(
      "SELECT id FROM users WHERE username = 'platform-admin'",
    );
    await pool.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'ADMIN')`,
      [tenantId, admin.rows[0].id],
    );
    expect((await tenantAdmin.post("/api/auth/tenant").send({ tenantId })).status).toBe(200);

    const created = await tenantAdmin.post("/api/admin/users").send({
      username: "employee-a",
      email: null,
      fullName: "Employee A",
      role: "ASSISTANT",
      password: "Employee0Start",
    });
    expect(created.status).toBe(201);
    const employeeId = created.body.user.id as string;

    const employeeSession = agentFor(app);
    expect((await employeeSession.post("/api/auth/login").send({
      username: "employee-a",
      password: "Employee0Start",
    })).status).toBe(200);

    const reset = await tenantAdmin
      .post(`/api/admin/users/${employeeId}/reset-password`)
      .send({});
    expect(reset.status).toBe(200);
    const temporaryPassword = reset.body.temporaryPassword as string;
    expect(temporaryPassword).toBeTruthy();
    expect((await employeeSession.get("/api/auth/me")).status).toBe(401);

    const temporarySession = agentFor(app);
    const temporaryLogin = await temporarySession.post("/api/auth/login").send({
      username: "employee-a",
      password: temporaryPassword,
    });
    expect(temporaryLogin.status).toBe(200);
    expect(temporaryLogin.body.user.mustChangePassword).toBe(true);
    const blocked = await temporarySession.get("/api/patients");
    expect(blocked.status).toBe(403);
    expect(blocked.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await temporarySession.get("/api/commercial/status")).body.code)
      .toBe("PASSWORD_CHANGE_REQUIRED");
    expect((await temporarySession.post("/api/auth/tenant").send({ tenantId })).body.code)
      .toBe("PASSWORD_CHANGE_REQUIRED");

    const changed = await temporarySession
      .post("/api/auth/forced-password-change")
      .send({ password: "Employee0Private" });
    expect(changed.status).toBe(204);
    expect((await temporarySession.get("/api/patients")).status).toBe(200);
    expect((await agentFor(app).post("/api/auth/login").send({
      username: "employee-a",
      password: temporaryPassword,
    })).status).toBe(401);

    const employeePrivateSession = agentFor(app);
    expect((await employeePrivateSession.post("/api/auth/login").send({
      username: "employee-a",
      password: "Employee0Private",
    })).status).toBe(200);
    expect((await employeePrivateSession
      .post(`/api/admin/users/${admin.rows[0].id}/reset-password`)
      .send({})).status).toBe(403);

    expect((await tenantAdmin
      .post(`/api/admin/users/${admin.rows[0].id}/reset-password`)
      .send({})).body.code).toBe("SELF_PASSWORD_RESET_BLOCKED");
    expect((await tenantAdmin
      .post(`/api/admin/users/${platformAdmin.rows[0].id}/reset-password`)
      .send({})).status).toBe(404);

    const tenantB = await pool.query<{ id: string }>(
      `INSERT INTO tenants (reference_code, name, status, activated_at)
       VALUES ('tenant-b', 'Tenant B', 'ACTIVE', now()) RETURNING id`,
    );
    const foreignHash = await bcrypt.hash("Foreign0Password", 10);
    const foreign = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ('foreign-user', $1, 'Foreign User', 'ASSISTANT') RETURNING id`,
      [foreignHash],
    );
    await pool.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role)
       VALUES ($1, $2, 'ASSISTANT')`,
      [tenantB.rows[0].id, foreign.rows[0].id],
    );
    expect((await tenantAdmin
      .post(`/api/admin/users/${foreign.rows[0].id}/reset-password`)
      .send({})).status).toBe(404);

    const disabled = await tenantAdmin.post("/api/admin/users").send({
      username: "disabled-user",
      email: null,
      fullName: "Disabled User",
      role: "DOCTOR",
      password: "Disabled0Start",
    });
    const disabledId = disabled.body.user.id as string;
    await tenantAdmin.post(`/api/admin/users/${disabledId}/deactivate`);
    expect((await tenantAdmin.post(`/api/admin/users/${disabledId}/reset-password`).send({})).status).toBe(200);
    const disabledState = await pool.query<{ is_active: boolean }>(
      `SELECT is_active FROM tenant_memberships
       WHERE tenant_id = $1 AND user_id = $2`,
      [tenantId, disabledId],
    );
    expect(disabledState.rows[0].is_active).toBe(false);

    const platformSession = agentFor(app);
    expect((await platformSession.post("/api/auth/login").send({
      username: "platform-admin",
      password: ADMIN_PASSWORD,
    })).status).toBe(200);
    const platformReset = await platformSession
      .post(`/api/platform-admin/tenants/${tenantId}/users/${admin.rows[0].id}/reset-password`)
      .send({});
    expect(platformReset.status).toBe(200);
    const adminTemporaryPassword = platformReset.body.temporaryPassword as string;
    expect((await tenantAdmin.get("/api/auth/me")).status).toBe(401);
    const adminTemporaryLogin = await agentFor(app).post("/api/auth/login").send({
      username: "admin",
      password: adminTemporaryPassword,
    });
    expect(adminTemporaryLogin.status).toBe(200);
    expect(adminTemporaryLogin.body.user.mustChangePassword).toBe(true);

    const audit = await pool.query<{ summary: string; details: string | null }>(
      `SELECT summary, details::text AS details FROM audit_logs
       WHERE action IN (
         'TENANT_ADMIN_RESET_USER_PASSWORD',
         'PLATFORM_ADMIN_RESET_TENANT_ADMIN_PASSWORD'
       )`,
    );
    expect(JSON.stringify(audit.rows)).not.toContain(temporaryPassword);
    expect(JSON.stringify(audit.rows)).not.toContain(adminTemporaryPassword);

    await pool.query(
      `UPDATE tenants SET status = 'TRIAL',
       trial_started_at = now() - interval '4 days',
       trial_ends_at = now() - interval '1 day'
       WHERE id = $1`,
      [tenantId],
    );
    expect((await employeePrivateSession.get("/api/patients")).body.code)
      .toBe("TENANT_TRIAL_EXPIRED");
    expect((await platformSession
      .post(`/api/platform-admin/tenants/${tenantId}/users/${admin.rows[0].id}/reset-password`)
      .send({})).body.code).toBe("TENANT_TRIAL_EXPIRED");

    await pool.query(
      "UPDATE tenants SET status = 'SUSPENDED', suspended_at = now() WHERE id = $1",
      [tenantId],
    );
    expect((await platformSession
      .post(`/api/platform-admin/tenants/${tenantId}/users/${admin.rows[0].id}/reset-password`)
      .send({})).body.code).toBe("TENANT_SUSPENDED");
  });
});