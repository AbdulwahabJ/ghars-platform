import { afterAll, beforeEach, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  agentFor,
  login,
  makePool,
  setupAdmin,
  truncateAll,
} from "./helpers";

const pool = makePool();
const password = "TargetPass1234";

type Fixture = {
  tenantId: string;
  otherTenantId: string;
  adminId: string;
  employeeId: string;
  inactiveId: string;
  mustChangeId: string;
  platformTargetId: string;
  platformAdminId: string;
};

let fixture: Fixture;

beforeEach(async () => {
  await truncateAll(pool);
  const setupAgent = agentFor(app);
  const platformAdmin = await setupAdmin(setupAgent, "platform-admin");
  const hash = await bcrypt.hash(password, 10);
  const tenant = await pool.query<{ id: string }>(
    `INSERT INTO tenants
       (reference_code, name, contact_name, contact_phone, status, activated_at)
     VALUES ('impersonation-one', 'Impersonation One', 'Owner', '0500000011', 'ACTIVE', now())
     RETURNING id`,
  );
  const platformTenant = await pool.query<{ id: string }>(
    "SELECT id FROM tenants WHERE reference_code = 'internal'",
  );
  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active)
     VALUES ($1, $2, 'ADMIN', true)`,
    [platformTenant.rows[0].id, platformAdmin.id],
  );
  const otherTenant = await pool.query<{ id: string }>(
    `INSERT INTO tenants
       (reference_code, name, contact_name, contact_phone, status, activated_at)
     VALUES ('impersonation-two', 'Impersonation Two', 'Owner', '0500000012', 'ACTIVE', now())
     RETURNING id`,
  );
  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active)
     VALUES ($1, $2, 'ADMIN', true)`,
    [otherTenant.rows[0].id, platformAdmin.id],
  );
  const users = await pool.query<{ id: string; username: string }>(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES
       ('impersonation-admin', $1, 'Target Admin', 'ADMIN'),
       ('impersonation-employee', $1, 'Target Employee', 'ASSISTANT'),
       ('impersonation-inactive', $1, 'Inactive Employee', 'ASSISTANT'),
       ('impersonation-must-change', $1, 'Password Change Target', 'ASSISTANT'),
       ('impersonation-platform', $1, 'Target Platform Admin', 'ADMIN')
     RETURNING id, username`,
    [hash],
  );
  const id = (username: string) =>
    users.rows.find((row) => row.username === username)!.id;
  const tenantId = tenant.rows[0].id;
  const otherTenantId = otherTenant.rows[0].id;
  const adminId = id("impersonation-admin");
  const employeeId = id("impersonation-employee");
  const inactiveId = id("impersonation-inactive");
  const mustChangeId = id("impersonation-must-change");
  const platformTargetId = id("impersonation-platform");
  await pool.query(
    "UPDATE users SET must_change_password = true WHERE id = $1",
    [mustChangeId],
  );
  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active, can_record_payments)
     VALUES
       ($1, $2, 'ADMIN', true, null),
       ($1, $3, 'ASSISTANT', true, true),
       ($1, $4, 'ASSISTANT', false, true),
       ($1, $5, 'ASSISTANT', true, true),
       ($1, $6, 'ADMIN', true, null),
       ($7, $3, 'ASSISTANT', true, true)`,
    [tenantId, adminId, employeeId, inactiveId, mustChangeId, platformTargetId, otherTenantId],
  );
  await pool.query(
    "INSERT INTO platform_admins (user_id) VALUES ($1)",
    [platformTargetId],
  );
  fixture = {
    tenantId,
    otherTenantId,
    adminId,
    employeeId,
    inactiveId,
    mustChangeId,
    platformTargetId,
    platformAdminId: platformAdmin.id,
  };
});

afterAll(async () => {
  await pool.end();
});

async function platformSession() {
  const agent = agentFor(app);
  await login(agent, "platform-admin", ADMIN_PASSWORD);
  return agent;
}

describe("secure platform-admin impersonation", () => {
  it("allows platform admins to impersonate customer admins and employees with target permissions", async () => {
    const agent = await platformSession();
    const originalMe = await agent.get("/api/auth/me");
    expect(originalMe.body.memberships.length).toBeGreaterThanOrEqual(2);
    const originalTenantId = originalMe.body.currentTenant.id;
    const before = await pool.query<{ sid: string }>(
      `SELECT sid FROM sessions WHERE sess ->> 'userId' = $1`,
      [fixture.platformAdminId],
    );
    const start = await agent
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Support investigation" });
    expect(start.status).toBe(200);
    expect(start.body).toEqual({ ok: true });
    const afterStart = await agent.get("/api/auth/me");
    expect(afterStart.status).toBe(200);
    expect(afterStart.body.user).toMatchObject({
      id: fixture.adminId,
      role: "ADMIN",
      canViewFinancials: true,
      canRecordPayments: true,
    });
    expect(afterStart.body.isPlatformAdmin).toBe(false);
    expect(afterStart.body.impersonation.startedAt).toEqual(expect.any(String));
    expect(afterStart.body.user).not.toHaveProperty("passwordHash");
    expect((await agent.get("/api/platform-admin/overview")).status).toBe(403);
    expect(
      (await agent.post("/api/auth/tenant").send({ tenantId: fixture.otherTenantId })).status,
    ).toBe(403);

    const after = await pool.query<{ sid: string }>(
      `SELECT sid FROM sessions WHERE sess ->> 'userId' = $1`,
      [fixture.adminId],
    );
    expect(after.rows[0]?.sid).toBeTruthy();
    expect(after.rows[0]?.sid).not.toBe(before.rows[0]?.sid);

    const supportSid = (
      await pool.query<{ sid: string }>(
        `SELECT sid FROM sessions WHERE sess ->> 'userId' = $1`,
        [fixture.adminId],
      )
    ).rows[0]?.sid;
    expect(supportSid).toBeTruthy();
    expect((await agent.post("/api/auth/impersonation/exit").send({})).body).toEqual({ ok: true });
    const restoredSid = (
      await pool.query<{ sid: string }>(
        `SELECT sid FROM sessions WHERE sess ->> 'userId' = $1`,
        [fixture.platformAdminId],
      )
    ).rows[0]?.sid;
    expect(restoredSid).toBeTruthy();
    expect(restoredSid).not.toBe(supportSid);
    const restored = await agent.get("/api/auth/me");
    expect(restored.body.user.id).toBe(fixture.platformAdminId);
    expect(restored.body.isPlatformAdmin).toBe(true);
    expect(restored.body.impersonation).toBeNull();
    expect(restored.body.currentTenant.id).toBe(originalTenantId);

    const employeeStart = await agent
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.employeeId}/impersonate`)
      .send({ reason: "Employee support check" });
    expect(employeeStart.status).toBe(200);
    const employee = await agent.get("/api/auth/me");
    expect(employee.body.user).toMatchObject({
      id: fixture.employeeId,
      role: "ASSISTANT",
      canViewFinancials: false,
      canRecordPayments: true,
    });
    expect((await agent.post("/api/auth/impersonation/exit").send({})).body).toEqual({ ok: true });
  });

  it("requires a reason and rejects inactive, other-tenant, and platform targets", async () => {
    const agent = await platformSession();
    const endpoint = (tenantId: string, userId: string) =>
      agent.post(`/api/platform-admin/tenants/${tenantId}/users/${userId}/impersonate`);
    expect((await endpoint(fixture.tenantId, fixture.adminId).send({ reason: " x " })).status).toBe(400);
    expect((await endpoint(fixture.tenantId, fixture.inactiveId).send({ reason: "valid reason" })).status).toBe(404);
    expect((await endpoint(fixture.otherTenantId, fixture.adminId).send({ reason: "valid reason" })).status).toBe(404);
    expect((await endpoint(fixture.tenantId, fixture.platformTargetId).send({ reason: "valid reason" })).status).toBe(403);
    expect((await endpoint(fixture.tenantId, fixture.mustChangeId).send({ reason: "valid reason" })).status).toBe(403);
  });

  it("does not expose or change passwords in support mode", async () => {
    const admin = await platformSession();
    const before = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [fixture.adminId],
    );
    await admin
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Password integrity check" });
    const change = await admin.post("/api/auth/change-password").send({
      currentPassword: password,
      newPassword: "ChangedPass1234",
    });
    expect(change.status).toBe(403);
    expect(change.body.code).toBe("IMPERSONATION_PASSWORD_CHANGE_BLOCKED");
    const forced = await admin.post("/api/auth/forced-password-change").send({
      password: "ChangedPass1234",
    });
    expect(forced.status).toBe(403);
    expect(forced.body.code).toBe("IMPERSONATION_PASSWORD_CHANGE_BLOCKED");
    const after = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [fixture.adminId],
    );
    expect(after.rows[0].password_hash).toBe(before.rows[0].password_hash);
    expect((await admin.post("/api/auth/impersonation/exit").send({})).body).toEqual({ ok: true });
  });

  it("terminates and restores when the target or pinned membership is disabled", async () => {
    const admin = await platformSession();
    await admin
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Disable target check" });
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [fixture.adminId]);
    const inactiveTarget = await admin.get("/api/auth/me");
    expect(inactiveTarget.status).toBe(401);
    expect(inactiveTarget.body).toMatchObject({
      code: "IMPERSONATION_TERMINATED",
      restoredOriginalAdmin: true,
    });
    const restored = await admin.get("/api/auth/me");
    expect(restored.status).toBe(200);
    expect(restored.body.user.id).toBe(fixture.platformAdminId);

    await pool.query("UPDATE users SET is_active = true WHERE id = $1", [fixture.adminId]);
    await admin
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Disable membership check" });
    await pool.query(
      "UPDATE tenant_memberships SET is_active = false WHERE tenant_id = $1 AND user_id = $2",
      [fixture.tenantId, fixture.adminId],
    );
    const inactiveMembership = await admin.get("/api/auth/me");
    expect(inactiveMembership.status).toBe(401);
    expect(inactiveMembership.body).toMatchObject({
      code: "IMPERSONATION_TERMINATED",
      restoredOriginalAdmin: true,
    });
    const audits = await pool.query<{ termination_reason: string }>(
      `SELECT details->>'terminationReason' AS termination_reason
       FROM audit_logs WHERE action = 'IMPERSONATION_ENDED'
       ORDER BY created_at`,
    );
    expect(audits.rows.map((row) => row.termination_reason)).toEqual([
      "TARGET_USER_INACTIVE",
      "TARGET_MEMBERSHIP_INACTIVE_OR_SESSION_MISMATCH",
    ]);
  });

  it("terminates if the original platform admin is disabled or loses platform authority", async () => {
    const admin = await platformSession();
    await admin
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Original authority check" });
    await pool.query("UPDATE users SET is_active = false WHERE id = $1", [fixture.platformAdminId]);
    const disabled = await admin.get("/api/auth/me");
    expect(disabled.status).toBe(401);
    expect(disabled.body).toMatchObject({
      code: "IMPERSONATION_TERMINATED",
      restoredOriginalAdmin: false,
    });
    expect((await admin.get("/api/auth/me")).status).toBe(401);
    expect((await pool.query<{ reason: string }>(
      `SELECT details->>'terminationReason' AS reason FROM audit_logs
       WHERE action = 'IMPERSONATION_ENDED'`,
    )).rows[0].reason).toBe("ORIGINAL_PLATFORM_ADMIN_INVALID");

    await pool.query("UPDATE users SET is_active = true WHERE id = $1", [fixture.platformAdminId]);
    const second = await platformSession();
    await second
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Original marker check" });
    await pool.query("DELETE FROM platform_admins WHERE user_id = $1", [fixture.platformAdminId]);
    const removedMarker = await second.get("/api/auth/me");
    expect(removedMarker.status).toBe(401);
    expect(removedMarker.body).toMatchObject({
      code: "IMPERSONATION_TERMINATED",
      restoredOriginalAdmin: false,
    });
  });

  it("audits logout termination and destroys all support session state", async () => {
    const admin = await platformSession();
    await admin
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .send({ reason: "Logout termination check" });
    expect((await admin.post("/api/auth/logout").send({})).status).toBe(204);
    expect((await admin.get("/api/auth/me")).status).toBe(401);
    const audit = await pool.query<{ reason: string; target: string }>(
      `SELECT details->>'terminationReason' AS reason,
              details->>'targetUserId' AS target
       FROM audit_logs WHERE action = 'IMPERSONATION_ENDED'`,
    );
    expect(audit.rows[0]).toMatchObject({
      reason: "LOGOUT",
      target: fixture.adminId,
    });
    const ended = await pool.query<{ restored: boolean }>(
      `SELECT (details->>'restoredOriginalAdmin')::boolean AS restored
       FROM audit_logs WHERE action = 'IMPERSONATION_ENDED'`,
    );
    expect(ended.rows[0].restored).toBe(false);
  });

  it("denies customer admins and employees, and records start/end audits without changing passwords", async () => {
    const customerAgent = agentFor(app);
    const customerRow = await pool.query<{ id: string }>(
      `INSERT INTO users (username, password_hash, full_name, role)
       VALUES ('impersonation-customer', $1, 'Customer', 'ADMIN')
       RETURNING id`,
      [await bcrypt.hash(password, 10)],
    );
    await pool.query(
      `INSERT INTO tenant_memberships (tenant_id, user_id, role, is_active)
       VALUES ($1, $2, 'ADMIN', true)`,
      [fixture.tenantId, customerRow.rows[0].id],
    );
    await login(customerAgent, "impersonation-customer", password);
    expect(
      (await customerAgent.post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`).send({
        reason: "not allowed",
      })).status,
    ).toBe(403);
    const employee = agentFor(app);
    await login(employee, "impersonation-employee", password);
    expect(
      (await employee.post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`).send({
        reason: "not allowed",
      })).status,
    ).toBe(403);

    const targetBefore = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [fixture.adminId],
    );
    const admin = await platformSession();
    const auditUserAgent = "impersonation-audit-test/1.0";
    await admin
      .post(`/api/platform-admin/tenants/${fixture.tenantId}/users/${fixture.adminId}/impersonate`)
      .set("User-Agent", auditUserAgent)
      .send({ reason: "Audit verification" });
    await admin
      .post("/api/auth/impersonation/exit")
      .set("User-Agent", auditUserAgent)
      .send({});
    const targetAfter = await pool.query<{ password_hash: string }>(
      "SELECT password_hash FROM users WHERE id = $1",
      [fixture.adminId],
    );
    expect(targetAfter.rows[0].password_hash).toBe(targetBefore.rows[0].password_hash);
    const audits = await pool.query<{
      action: string;
      user_id: string;
      tenant_id: string;
      details: Record<string, unknown>;
    }>(
      `SELECT action, user_id, tenant_id, details
       FROM audit_logs
       WHERE action IN ('IMPERSONATION_STARTED', 'IMPERSONATION_ENDED')
       ORDER BY created_at`,
    );
    expect(audits.rows).toHaveLength(2);
    expect(audits.rows.filter((row) => row.action === "IMPERSONATION_STARTED")).toHaveLength(1);
    expect(audits.rows.filter((row) => row.action === "IMPERSONATION_ENDED")).toHaveLength(1);
    for (const audit of audits.rows) {
      expect(audit.user_id).toBe(fixture.platformAdminId);
      expect(audit.tenant_id).toBe(fixture.tenantId);
      expect(audit.details).toMatchObject({
        originalPlatformAdminId: fixture.platformAdminId,
        targetUserId: fixture.adminId,
        targetTenantId: fixture.tenantId,
        reason: "Audit verification",
        userAgent: auditUserAgent,
      });
      if (audit.action === "IMPERSONATION_ENDED") {
        expect(audit.details).toMatchObject({ restoredOriginalAdmin: true });
      }
    }
  });
});