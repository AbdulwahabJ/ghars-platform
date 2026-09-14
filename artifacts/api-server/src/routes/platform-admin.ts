import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import rateLimit from "express-rate-limit";
import {
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  isNull,
  lte,
  or,
  sql,
  type SQL,
} from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  auditLogsTable,
  db,
  platformAdminsTable,
  platformSettingsTable,
  sessionsTable,
  systemErrorsTable,
  tenantActivationRequestsTable,
  tenantMembershipsTable,
  tenantsTable,
  usersTable,
} from "@workspace/db";
import {
  extendTrialInputSchema,
  platformActivationRequestsInputSchema,
  platformAuditInputSchema,
  platformErrorsInputSchema,
  platformTenantListInputSchema,
  platformTrialsInputSchema,
  resetPasswordInputSchema,
  resolveActivationRequestInputSchema,
  resolvePlatformErrorInputSchema,
  updateActivationWorkflowInputSchema,
  updatePlatformSettingsInputSchema,
  impersonateUserInputSchema,
} from "@workspace/shared";
import { writeAudit, writeAuditRequired } from "../lib/audit";
import {
  restoreOriginalAdmin,
  type ImpersonationSnapshot,
} from "../lib/impersonation";
import { loadPlatformSettings } from "../lib/platform-settings";
import {
  inspectSchemaHealth,
  type SchemaQueryExecutor,
} from "../lib/schema-health";
import { parseOrRespond } from "../lib/validation";

const router: IRouter = Router();
const APP_VERSION = process.env.APP_VERSION ?? "development";
const ENVIRONMENT = process.env.NODE_ENV ?? "development";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const impersonationLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "عدد محاولات انتحال الهوية كبير. يرجى المحاولة لاحقًا.", code: "RATE_LIMITED" },
});

const requestDto = (row: typeof tenantActivationRequestsTable.$inferSelect) => ({
  id: row.id,
  tenantId: row.tenantId,
  requestedByUserId: row.requestedByUserId,
  status: row.status,
  workflowStatus: row.workflowStatus as
    | "NEW" | "CONTACTED" | "AWAITING_PAYMENT"
    | "PAYMENT_RECEIVED" | "ACTIVATED" | "CLOSED",
  note: row.note,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  resolvedAt: row.resolvedAt?.toISOString() ?? null,
  resolvedByUserId: row.resolvedByUserId ?? null,
});

function tenantDto(
  tenant: typeof tenantsTable.$inferSelect,
  extra: {
    userCount?: number;
    activationRequestCount?: number;
    lastActivityAt?: Date | string | null;
  } = {},
) {
  return {
    id: tenant.id,
    referenceCode: tenant.referenceCode,
    name: tenant.name,
    contactName: tenant.contactName,
    contactEmail: tenant.contactEmail,
    contactPhone: tenant.contactPhone,
    city: tenant.city,
    locale: tenant.locale === "en" ? "en" as const : "ar" as const,
    isInternal: tenant.isInternal,
    status: tenant.status,
    trialStartedAt: tenant.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    activatedAt: tenant.activatedAt?.toISOString() ?? null,
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    createdAt: tenant.createdAt.toISOString(),
    lastActivityAt: extra.lastActivityAt
      ? new Date(extra.lastActivityAt).toISOString()
      : null,
    userCount: Number(extra.userCount ?? 0),
    activationRequestCount: Number(extra.activationRequestCount ?? 0),
  };
}

const tenantAggregateSelection = {
  tenant: tenantsTable,
  userCount: sql<number>`(
    SELECT count(*)::int
    FROM tenant_memberships tm
    JOIN users u ON u.id = tm.user_id
    WHERE tm.tenant_id = "tenants"."id"
      AND tm.is_active = true
      AND u.is_active = true
  )`,
  activationRequestCount: sql<number>`(
    SELECT count(*)::int FROM tenant_activation_requests ar
    WHERE ar.tenant_id = ${tenantsTable.id}
  )`,
  lastActivityAt: sql<Date | null>`(
    SELECT max(al.created_at) FROM audit_logs al
    WHERE al.tenant_id = ${tenantsTable.id}
  )`,
};

function tenantSearch(query?: string): SQL | undefined {
  if (!query) return undefined;
  const like = `%${query}%`;
  return or(
    ilike(tenantsTable.name, like),
    ilike(tenantsTable.referenceCode, like),
    ilike(tenantsTable.contactName, like),
    ilike(tenantsTable.contactPhone, like),
    sql`EXISTS (
      SELECT 1 FROM tenant_memberships tm
      JOIN users u ON u.id = tm.user_id
      WHERE tm.tenant_id = ${tenantsTable.id} AND u.username ILIKE ${like}
    )`,
  );
}

router.post(
  "/platform-admin/tenants/:tenantId/users/:userId/impersonate",
  impersonationLimiter,
  async (req, res) => {
    if (req.session.originalPlatformAdminId) {
      res.status(403).json({
        error: "لا يمكن بدء انتحال هوية داخل جلسة انتحال أخرى.",
        code: "IMPERSONATION_NESTED",
      });
      return;
    }
    const input = parseOrRespond(impersonateUserInputSchema, req.body, res);
    if (!input) return;

    const tenantId = String(req.params.tenantId);
    const targetUserId = String(req.params.userId);
    if (!UUID_PATTERN.test(tenantId) || !UUID_PATTERN.test(targetUserId)) {
      res.status(404).json({ error: "المستخدم أو العميل غير موجود.", code: "IMPERSONATION_TARGET_INVALID" });
      return;
    }
    const [tenant] = await db
      .select({ id: tenantsTable.id })
      .from(tenantsTable)
      .where(and(eq(tenantsTable.id, tenantId), eq(tenantsTable.isInternal, false)))
      .limit(1);
    if (!tenant) {
      res.status(404).json({ error: "العميل غير موجود.", code: "TENANT_NOT_FOUND" });
      return;
    }

    const [target] = await db
      .select({
        id: usersTable.id,
        isActive: usersTable.isActive,
        mustChangePassword: usersTable.mustChangePassword,
        membershipActive: tenantMembershipsTable.isActive,
      })
      .from(usersTable)
      .innerJoin(
        tenantMembershipsTable,
        and(
          eq(tenantMembershipsTable.userId, usersTable.id),
          eq(tenantMembershipsTable.tenantId, tenantId),
        ),
      )
      .where(eq(usersTable.id, targetUserId))
      .limit(1);
    if (!target || !target.isActive || !target.membershipActive) {
      res.status(404).json({
        error: "المستخدم غير موجود أو لا يملك عضوية نشطة في هذه العيادة.",
        code: "IMPERSONATION_TARGET_INVALID",
      });
      return;
    }
    if (target.mustChangePassword) {
      res.status(403).json({
        error: "لا يمكن انتحال هوية حساب يتطلب تغيير كلمة المرور.",
        code: "IMPERSONATION_TARGET_PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }
    const [targetPlatformAdmin] = await db
      .select({ userId: platformAdminsTable.userId })
      .from(platformAdminsTable)
      .where(eq(platformAdminsTable.userId, targetUserId))
      .limit(1);
    if (targetPlatformAdmin) {
      res.status(403).json({
        error: "لا يمكن انتحال هوية مسؤول منصة.",
        code: "IMPERSONATION_PLATFORM_ADMIN_TARGET",
      });
      return;
    }

    const originalAdminId = req.currentUser!.id;
    const originalAdminTenantId = req.session.tenantId;
    const startedAt = new Date().toISOString();
    const lifecycle: ImpersonationSnapshot = {
      originalAdminId,
      originalTenantId: originalAdminTenantId,
      targetUserId,
      targetTenantId: tenantId,
      startedAt,
      reason: input.reason,
    };
    try {
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((err) => (err ? reject(err) : resolve())),
      );
      req.session.userId = targetUserId;
      req.session.tenantId = tenantId;
      req.session.originalPlatformAdminId = originalAdminId;
      if (originalAdminTenantId) {
        req.session.originalPlatformAdminTenantId = originalAdminTenantId;
      }
      req.session.impersonationTargetUserId = targetUserId;
      req.session.impersonationTargetTenantId = tenantId;
      req.session.impersonationStartedAt = startedAt;
      req.session.impersonationReason = input.reason;
      await new Promise<void>((resolve, reject) =>
        req.session.save((err) => (err ? reject(err) : resolve())),
      );
    } catch {
      await restoreOriginalAdmin(req, lifecycle);
      res.status(500).json({
        error: "تعذر إنشاء جلسة الدعم بأمان.",
        code: "IMPERSONATION_START_FAILED",
      });
      return;
    }
    try {
      await writeAuditRequired({
        tenantId,
        userId: originalAdminId,
        action: "IMPERSONATION_STARTED",
        entityType: "user",
        entityId: targetUserId,
        summary: "بدء انتحال هوية مستخدم",
        details: {
          originalPlatformAdminId: originalAdminId,
          targetUserId,
          targetTenantId: tenantId,
          reason: input.reason,
          startedAt,
          requestIp: req.ip,
          ip: req.ip,
          userAgent: req.get("user-agent") ?? null,
        },
      });
    } catch {
      // The support session was never acknowledged without its START audit.
      // Restore the captured original context, or destroy if restoration fails.
      await restoreOriginalAdmin(req, lifecycle);
      res.status(500).json({
        error: "تعذر تسجيل بدء جلسة الدعم بأمان.",
        code: "IMPERSONATION_START_FAILED",
      });
      return;
    }
    res.json({ ok: true });
  },
);

router.get("/platform-admin/overview", async (_req, res) => {
  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const today = now.toISOString().slice(0, 10);
  const month = today.slice(0, 7);
  const [metric] = await db.select({
    totalCustomers: sql<number>`count(*)::int`,
    activeCustomers: sql<number>`count(*) FILTER (WHERE ${tenantsTable.status} = 'ACTIVE')::int`,
    trialCustomers: sql<number>`count(*) FILTER (WHERE ${tenantsTable.status} = 'TRIAL' AND ${tenantsTable.trialEndsAt} > now())::int`,
    expiringTrials: sql<number>`count(*) FILTER (WHERE ${tenantsTable.status} = 'TRIAL' AND ${tenantsTable.trialEndsAt} > now() AND ${tenantsTable.trialEndsAt} <= ${in24Hours})::int`,
    expiredTrials: sql<number>`count(*) FILTER (WHERE ${tenantsTable.status} = 'TRIAL' AND ${tenantsTable.trialEndsAt} <= now())::int`,
    suspendedCustomers: sql<number>`count(*) FILTER (WHERE ${tenantsTable.status} = 'SUSPENDED')::int`,
    newToday: sql<number>`count(*) FILTER (WHERE ${tenantsTable.createdAt}::date = ${today}::date)::int`,
    newThisMonth: sql<number>`count(*) FILTER (WHERE to_char(${tenantsTable.createdAt}, 'YYYY-MM') = ${month})::int`,
  }).from(tenantsTable).where(eq(tenantsTable.isInternal, false));
  const [[activationCount], [errorCount], expiringRows, recentActivations, recentErrors, recentActivity, registrations, distribution] =
    await Promise.all([
      db.select({ count: sql<number>`count(*)::int` }).from(tenantActivationRequestsTable)
        .innerJoin(tenantsTable, eq(tenantsTable.id, tenantActivationRequestsTable.tenantId))
        .where(and(
          eq(tenantsTable.isInternal, false),
          sql`${tenantActivationRequestsTable.workflowStatus} NOT IN ('ACTIVATED','CLOSED')`,
        )),
      db.select({ count: sql<number>`count(*)::int` }).from(systemErrorsTable)
        .where(eq(systemErrorsTable.isResolved, false)),
      db.select(tenantAggregateSelection).from(tenantsTable)
        .where(and(
          eq(tenantsTable.isInternal, false),
          eq(tenantsTable.status, "TRIAL"),
          gte(tenantsTable.trialEndsAt, now),
          lte(tenantsTable.trialEndsAt, in24Hours),
        )).orderBy(asc(tenantsTable.trialEndsAt)).limit(6),
      db.select({
        id: auditLogsTable.id,
        action: auditLogsTable.action,
        actor: usersTable.fullName,
        tenant: tenantsTable,
        createdAt: auditLogsTable.createdAt,
      }).from(auditLogsTable)
        .innerJoin(tenantsTable, eq(tenantsTable.id, auditLogsTable.tenantId))
        .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
        .where(and(
          eq(tenantsTable.isInternal, false),
          sql`${auditLogsTable.action} IN ('platform_tenant_activate', 'platform_tenant_reactivate')`,
        ))
        .orderBy(desc(auditLogsTable.createdAt)).limit(6),
      db.select({
        error: systemErrorsTable,
        tenantName: tenantsTable.name,
      }).from(systemErrorsTable)
        .leftJoin(tenantsTable, eq(tenantsTable.id, systemErrorsTable.tenantId))
        .orderBy(desc(systemErrorsTable.occurredAt)).limit(6),
      db.select({
        id: auditLogsTable.id,
        actor: usersTable.fullName,
        action: auditLogsTable.action,
        tenantName: tenantsTable.name,
        reference: tenantsTable.referenceCode,
        summary: auditLogsTable.summary,
        createdAt: auditLogsTable.createdAt,
      }).from(auditLogsTable)
        .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
        .leftJoin(tenantsTable, eq(tenantsTable.id, auditLogsTable.tenantId))
        .where(and(
          sql`(${auditLogsTable.action} ILIKE 'platform_%' OR ${auditLogsTable.action} ILIKE 'TENANT_%')`,
          or(isNull(auditLogsTable.tenantId), eq(tenantsTable.isInternal, false)),
        ))
        .orderBy(desc(auditLogsTable.createdAt)).limit(8),
      db.select({
        bucket: sql<string>`to_char(${tenantsTable.createdAt}, 'YYYY-MM-DD')`,
        count: sql<number>`count(*)::int`,
      }).from(tenantsTable).where(and(
        eq(tenantsTable.isInternal, false),
        gte(tenantsTable.createdAt, new Date(now.getTime() - 30 * 86400000)),
      )).groupBy(sql`to_char(${tenantsTable.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${tenantsTable.createdAt}, 'YYYY-MM-DD')`),
      db.select({
        status: sql<string>`CASE
          WHEN ${tenantsTable.status} = 'TRIAL' AND ${tenantsTable.trialEndsAt} <= now() THEN 'EXPIRED'
          ELSE ${tenantsTable.status}::text END`,
        count: sql<number>`count(*)::int`,
      }).from(tenantsTable).where(eq(tenantsTable.isInternal, false))
        .groupBy(sql`CASE WHEN ${tenantsTable.status} = 'TRIAL' AND ${tenantsTable.trialEndsAt} <= now() THEN 'EXPIRED' ELSE ${tenantsTable.status}::text END`),
    ]);
  res.json({
    metrics: {
      ...(metric ?? {
        totalCustomers: 0, activeCustomers: 0, trialCustomers: 0,
        expiringTrials: 0, expiredTrials: 0, suspendedCustomers: 0,
        newToday: 0, newThisMonth: 0,
      }),
      openActivationRequests: activationCount?.count ?? 0,
      openSystemErrors: errorCount?.count ?? 0,
    },
    registrations,
    statusDistribution: distribution,
    expiringTrials: expiringRows.map((r) => tenantDto(r.tenant, r)),
    recentActivations: recentActivations.map((r) => ({
      id: r.id,
      action: r.action,
      actor: r.actor,
      tenant: tenantDto(r.tenant),
      createdAt: r.createdAt.toISOString(),
    })),
    recentErrors: recentErrors.map(({ error, tenantName }) => ({
      id: error.id,
      referenceCode: error.referenceCode,
      tenantName,
      errorType: error.errorType,
      safeMessage: error.safeMessage,
      isResolved: error.isResolved,
      occurredAt: error.occurredAt.toISOString(),
    })),
    recentActivity: recentActivity.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
    environment: { name: ENVIRONMENT, version: APP_VERSION },
  });
});

router.get("/platform-admin/tenants", async (req, res) => {
  const input = parseOrRespond(platformTenantListInputSchema, req.query, res);
  if (!input) return;
  const conditions: SQL[] = [eq(tenantsTable.isInternal, false)];
  if (input.status === "EXPIRED") {
    conditions.push(eq(tenantsTable.status, "TRIAL"), lte(tenantsTable.trialEndsAt, new Date()));
  } else if (input.status) {
    conditions.push(eq(tenantsTable.status, input.status));
    if (input.status === "TRIAL") conditions.push(gte(tenantsTable.trialEndsAt, new Date()));
  }
  const search = tenantSearch(input.query);
  if (search) conditions.push(search);
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    db.select(tenantAggregateSelection).from(tenantsTable).where(where)
      .orderBy(desc(tenantsTable.createdAt)).limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ count: sql<number>`count(*)::int` }).from(tenantsTable).where(where),
  ]);
  res.json({
    items: rows.map((row) => tenantDto(row.tenant, row)),
    total: count?.count ?? 0,
    page: input.page,
    limit: input.limit,
  });
});

router.get("/platform-admin/tenants/:tenantId", async (req, res) => {
  const tenantId = String(req.params.tenantId);
  const [tenant] = await db.select().from(tenantsTable).where(and(
    eq(tenantsTable.id, tenantId),
    eq(tenantsTable.isInternal, false),
  )).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "العميل غير موجود.", code: "TENANT_NOT_FOUND" });
    return;
  }
  const [requests, tenantUsers, countsResult, errors, audit] = await Promise.all([
    db.select().from(tenantActivationRequestsTable)
      .where(eq(tenantActivationRequestsTable.tenantId, tenantId))
      .orderBy(desc(tenantActivationRequestsTable.createdAt)),
    db.select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      username: usersTable.username,
      role: tenantMembershipsTable.role,
      isActive: sql<boolean>`${tenantMembershipsTable.isActive} AND ${usersTable.isActive}`,
      lastLoginAt: usersTable.lastLoginAt,
    }).from(tenantMembershipsTable)
      .innerJoin(usersTable, eq(usersTable.id, tenantMembershipsTable.userId))
      .where(eq(tenantMembershipsTable.tenantId, tenantId))
      .orderBy(asc(usersTable.createdAt)),
    db.execute<{
      patients: number; cases: number; last_activity_at: Date | null;
    }>(sql`SELECT
      (SELECT count(*)::int FROM patients WHERE tenant_id = ${tenantId}) AS patients,
      (SELECT count(*)::int FROM implant_cases WHERE tenant_id = ${tenantId}) AS cases,
      (SELECT max(created_at) FROM audit_logs WHERE tenant_id = ${tenantId}) AS last_activity_at`),
    db.select().from(systemErrorsTable)
      .where(eq(systemErrorsTable.tenantId, tenantId))
      .orderBy(desc(systemErrorsTable.occurredAt)).limit(5),
    db.select({
      id: auditLogsTable.id,
      action: auditLogsTable.action,
      summary: auditLogsTable.summary,
      createdAt: auditLogsTable.createdAt,
    }).from(auditLogsTable)
      .where(and(
        eq(auditLogsTable.tenantId, tenantId),
        sql`${auditLogsTable.action} ILIKE 'platform_%' OR ${auditLogsTable.action} ILIKE 'TENANT_%'`,
      )).orderBy(desc(auditLogsTable.createdAt)).limit(10),
  ]);
  const usage = countsResult.rows[0] as unknown as {
    patients?: number;
    cases?: number;
    last_activity_at?: Date | null;
  } | undefined;
  res.json({
    tenant: {
      ...tenantDto(tenant, {
        userCount: tenantUsers.filter((user) => user.isActive).length,
        activationRequestCount: requests.length,
        lastActivityAt: usage?.last_activity_at ?? null,
      }),
      legalName: tenant.legalName,
      users: tenantUsers.map((u) => ({
        ...u,
        lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
      })),
      activationRequests: requests.map(requestDto),
      usage: {
        patientCount: Number(usage?.patients ?? 0),
        implantCaseCount: Number(usage?.cases ?? 0),
      },
      recentErrors: errors.map((error) => ({
        id: error.id,
        referenceCode: error.referenceCode,
        errorType: error.errorType,
        safeMessage: error.safeMessage,
        isResolved: error.isResolved,
        occurredAt: error.occurredAt.toISOString(),
      })),
      commercialAudit: audit.map((row) => ({
        ...row,
        createdAt: row.createdAt.toISOString(),
      })),
    },
  });
});

router.get("/platform-admin/trials", async (req, res) => {
  const input = parseOrRespond(platformTrialsInputSchema, req.query, res);
  if (!input) return;
  const now = new Date();
  const conditions: SQL[] = [
    eq(tenantsTable.isInternal, false),
    eq(tenantsTable.status, "TRIAL"),
  ];
  if (input.view === "active") conditions.push(gte(tenantsTable.trialEndsAt, now));
  if (input.view === "expiring") {
    conditions.push(gte(tenantsTable.trialEndsAt, now));
    conditions.push(lte(tenantsTable.trialEndsAt, new Date(now.getTime() + 24 * 60 * 60 * 1000)));
  }
  if (input.view === "expired") conditions.push(lte(tenantsTable.trialEndsAt, now));
  if (input.view === "extended") {
    conditions.push(sql`EXISTS (
      SELECT 1 FROM audit_logs al
      WHERE al.tenant_id = ${tenantsTable.id}
        AND al.action = 'platform_tenant_extend_trial'
    )`);
  }
  const search = tenantSearch(input.query);
  if (search) conditions.push(search);
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    db.select(tenantAggregateSelection).from(tenantsTable).where(where)
      .orderBy(asc(tenantsTable.trialEndsAt)).limit(input.limit)
      .offset((input.page - 1) * input.limit),
    db.select({ count: sql<number>`count(*)::int` }).from(tenantsTable).where(where),
  ]);
  res.json({
    items: rows.map((row) => tenantDto(row.tenant, row)),
    total: count?.count ?? 0,
    page: input.page,
    limit: input.limit,
  });
});

router.get("/platform-admin/activation-requests", async (req, res) => {
  const input = parseOrRespond(platformActivationRequestsInputSchema, req.query, res);
  if (!input) return;
  const conditions: SQL[] = [eq(tenantsTable.isInternal, false)];
  if (input.workflowStatus) conditions.push(eq(tenantActivationRequestsTable.workflowStatus, input.workflowStatus));
  if (input.from) conditions.push(gte(tenantActivationRequestsTable.createdAt, new Date(`${input.from}T00:00:00Z`)));
  if (input.to) conditions.push(lte(tenantActivationRequestsTable.createdAt, new Date(`${input.to}T23:59:59Z`)));
  if (input.query) {
    const like = `%${input.query}%`;
    conditions.push(or(
      ilike(tenantsTable.name, like),
      ilike(tenantsTable.referenceCode, like),
      ilike(tenantsTable.contactName, like),
      ilike(tenantsTable.contactPhone, like),
    )!);
  }
  const where = and(...conditions);
  const [rows, [count]] = await Promise.all([
    db.select({ request: tenantActivationRequestsTable, tenant: tenantsTable })
      .from(tenantActivationRequestsTable)
      .innerJoin(tenantsTable, eq(tenantsTable.id, tenantActivationRequestsTable.tenantId))
      .where(where).orderBy(desc(tenantActivationRequestsTable.createdAt))
      .limit(input.limit).offset((input.page - 1) * input.limit),
    db.select({ count: sql<number>`count(*)::int` }).from(tenantActivationRequestsTable)
      .innerJoin(tenantsTable, eq(tenantsTable.id, tenantActivationRequestsTable.tenantId))
      .where(where),
  ]);
  res.json({
    items: rows.map((row) => ({ request: requestDto(row.request), tenant: tenantDto(row.tenant) })),
    total: count?.count ?? 0,
    page: input.page,
    limit: input.limit,
  });
});

router.patch("/platform-admin/activation-requests/:requestId", async (req, res) => {
  const input = parseOrRespond(updateActivationWorkflowInputSchema, req.body, res);
  if (!input) return;
  const [request] = await db.select({ id: tenantActivationRequestsTable.id })
    .from(tenantActivationRequestsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, tenantActivationRequestsTable.tenantId))
    .where(and(
      eq(tenantActivationRequestsTable.id, String(req.params.requestId)),
      eq(tenantsTable.isInternal, false),
    )).limit(1);
  if (!request) {
    res.status(404).json({ error: "طلب التفعيل غير موجود.", code: "ACTIVATION_REQUEST_NOT_FOUND" });
    return;
  }
  const [updated] = await db.update(tenantActivationRequestsTable).set({
    workflowStatus: input.workflowStatus,
    note: input.note,
    updatedAt: new Date(),
    ...(input.workflowStatus === "CLOSED" || input.workflowStatus === "ACTIVATED"
      ? { status: "APPROVED" as const, resolvedAt: new Date(), resolvedByUserId: req.currentUser!.id }
      : {}),
  }).where(eq(tenantActivationRequestsTable.id, String(req.params.requestId))).returning();
  if (!updated) {
    res.status(404).json({ error: "طلب التفعيل غير موجود.", code: "ACTIVATION_REQUEST_NOT_FOUND" });
    return;
  }
  await writeAudit({
    tenantId: updated.tenantId,
    userId: req.currentUser!.id,
    action: "platform_activation_request_updated",
    entityType: "activation_request",
    entityId: updated.id,
    summary: "تحديث حالة سير طلب التفعيل",
    details: { workflowStatus: input.workflowStatus },
  });
  res.json({ request: requestDto(updated) });
});

router.get("/platform-admin/errors", async (req, res) => {
  const input = parseOrRespond(platformErrorsInputSchema, req.query, res);
  if (!input) return;
  const conditions: SQL[] = [];
  if (input.query) conditions.push(ilike(systemErrorsTable.referenceCode, `%${input.query}%`));
  if (input.tenantId) conditions.push(eq(systemErrorsTable.tenantId, input.tenantId));
  if (input.status) conditions.push(eq(systemErrorsTable.isResolved, input.status === "resolved"));
  if (input.errorType) conditions.push(eq(systemErrorsTable.errorType, input.errorType));
  if (input.from) conditions.push(gte(systemErrorsTable.occurredAt, new Date(`${input.from}T00:00:00Z`)));
  if (input.to) conditions.push(lte(systemErrorsTable.occurredAt, new Date(`${input.to}T23:59:59Z`)));
  const where = conditions.length ? and(...conditions) : undefined;
  const selection = {
    error: systemErrorsTable,
    tenantName: tenantsTable.name,
    username: usersTable.username,
  };
  const [rows, [count], types] = await Promise.all([
    db.select(selection).from(systemErrorsTable)
      .leftJoin(tenantsTable, eq(tenantsTable.id, systemErrorsTable.tenantId))
      .leftJoin(usersTable, eq(usersTable.id, systemErrorsTable.userId))
      .where(where).orderBy(desc(systemErrorsTable.occurredAt))
      .limit(input.limit).offset((input.page - 1) * input.limit),
    db.select({ count: sql<number>`count(*)::int` }).from(systemErrorsTable).where(where),
    db.selectDistinct({ errorType: systemErrorsTable.errorType }).from(systemErrorsTable)
      .orderBy(asc(systemErrorsTable.errorType)),
  ]);
  res.json({
    items: rows.map(({ error, tenantName, username }) => ({
      id: error.id,
      referenceCode: error.referenceCode,
      tenantId: error.tenantId,
      tenantName,
      username,
      route: error.route,
      method: error.method,
      errorType: error.errorType,
      safeMessage: error.safeMessage,
      environment: error.environment,
      applicationVersion: error.applicationVersion,
      isResolved: error.isResolved,
      resolutionNote: error.resolutionNote,
      occurredAt: error.occurredAt.toISOString(),
      resolvedAt: error.resolvedAt?.toISOString() ?? null,
    })),
    total: count?.count ?? 0,
    page: input.page,
    limit: input.limit,
    errorTypes: types.map((row) => row.errorType),
  });
});

router.patch("/platform-admin/errors/:errorId", async (req, res) => {
  const input = parseOrRespond(resolvePlatformErrorInputSchema, req.body, res);
  if (!input) return;
  const [updated] = await db.update(systemErrorsTable).set({
    isResolved: input.resolved,
    resolutionNote: input.note ?? null,
    resolvedAt: input.resolved ? new Date() : null,
    resolvedByUserId: input.resolved ? req.currentUser!.id : null,
  }).where(eq(systemErrorsTable.id, String(req.params.errorId))).returning();
  if (!updated) {
    res.status(404).json({ error: "الخطأ غير موجود.", code: "SYSTEM_ERROR_NOT_FOUND" });
    return;
  }
  await writeAudit({
    tenantId: updated.tenantId,
    userId: req.currentUser!.id,
    action: input.resolved ? "platform_error_resolved" : "platform_error_reopened",
    entityType: "system_error",
    entityId: updated.id,
    summary: input.resolved ? "تم إغلاق خطأ نظام" : "أعيد فتح خطأ نظام",
  });
  res.json({ error: { ...updated, occurredAt: updated.occurredAt.toISOString(), resolvedAt: updated.resolvedAt?.toISOString() ?? null } });
});

router.get("/platform-admin/health", async (_req, res) => {
  const started = Date.now();
  const components: Record<string, {
    status: "healthy" | "warning" | "unavailable";
    messageCode: string;
    value?: number;
    latencyMs?: number;
  }> = {
    api: { status: "healthy", messageCode: "apiResponding" },
  };
  let databaseAvailable = false;
  try {
    await db.execute(sql`SELECT 1`);
    databaseAvailable = true;
    components.database = { status: "healthy", messageCode: "databaseReachable", latencyMs: Date.now() - started };
  } catch {
    components.database = { status: "unavailable", messageCode: "databaseUnavailable" };
  }
  try {
    await db.select({ count: sql<number>`count(*)::int` }).from(sessionsTable);
    components.sessions = { status: "healthy", messageCode: "sessionsReachable" };
  } catch {
    components.sessions = { status: "unavailable", messageCode: "sessionsUnavailable" };
  }
  // User-uploaded avatars are stored in PostgreSQL, so no ephemeral filesystem
  // or external object-storage dependency exists in this release.
  components.storage = databaseAvailable
    ? { status: "healthy", messageCode: "storageDatabaseBacked" }
    : { status: "unavailable", messageCode: "storageDatabaseUnavailable" };
  components.email = process.env.SUPPORT_EMAIL
    ? { status: "warning", messageCode: "emailSupportOnly" }
    : { status: "warning", messageCode: "emailDisabled" };
  if (databaseAvailable) {
    try {
      const [errors] = await db.select({ count: sql<number>`count(*)::int` }).from(systemErrorsTable)
        .where(and(eq(systemErrorsTable.isResolved, false), gte(systemErrorsTable.occurredAt, new Date(Date.now() - 3600000))));
      components.recentErrors = Number(errors?.count ?? 0) > 0
        ? { status: "warning", messageCode: "recentErrorsOpen", value: Number(errors?.count ?? 0) }
        : { status: "healthy", messageCode: "recentErrorsNone", value: 0 };
    } catch {
      components.recentErrors = { status: "unavailable", messageCode: "recentErrorsUnavailable" };
    }

    const executeSchemaQuery: SchemaQueryExecutor = async (query) => {
      const result = await db.execute(query);
      return { rows: result.rows as Array<Record<string, unknown>> };
    };
    components.schema = await inspectSchemaHealth(executeSchemaQuery);
    if (components.schema.messageCode === "schemaDatabaseUnavailable") {
      components.database = { status: "unavailable", messageCode: "databaseUnavailable" };
      components.storage = { status: "unavailable", messageCode: "storageDatabaseUnavailable" };
    }
  } else {
    components.recentErrors = { status: "unavailable", messageCode: "recentErrorsUnavailable" };
    components.schema = { status: "unavailable", messageCode: "schemaDatabaseUnavailable" };
  }
  const statuses = Object.values(components).map((component) => component.status);
  const overall = statuses.includes("unavailable") ? "unavailable" : statuses.includes("warning") ? "warning" : "healthy";
  res.json({
    overall,
    checkedAt: new Date().toISOString(),
    environment: ENVIRONMENT,
    applicationVersion: APP_VERSION,
    components,
  });
});

router.get("/platform-admin/audit", async (req, res) => {
  const input = parseOrRespond(platformAuditInputSchema, req.query, res);
  if (!input) return;
  const conditions: SQL[] = [
    sql`(${auditLogsTable.action} ILIKE 'platform_%' OR ${auditLogsTable.action} ILIKE 'TENANT_%')`,
    or(isNull(auditLogsTable.tenantId), eq(tenantsTable.isInternal, false))!,
  ];
  if (input.actor) conditions.push(ilike(usersTable.fullName, `%${input.actor}%`));
  if (input.action) conditions.push(eq(auditLogsTable.action, input.action));
  if (input.tenantId) conditions.push(eq(auditLogsTable.tenantId, input.tenantId));
  if (input.from) conditions.push(gte(auditLogsTable.createdAt, new Date(`${input.from}T00:00:00Z`)));
  if (input.to) conditions.push(lte(auditLogsTable.createdAt, new Date(`${input.to}T23:59:59Z`)));
  const where = and(...conditions);
  const [rows, [count], actions] = await Promise.all([
    db.select({
      id: auditLogsTable.id,
      actor: usersTable.fullName,
      action: auditLogsTable.action,
      tenantId: auditLogsTable.tenantId,
      tenantName: tenantsTable.name,
      reference: tenantsTable.referenceCode,
      summary: auditLogsTable.summary,
      metadata: auditLogsTable.details,
      createdAt: auditLogsTable.createdAt,
    }).from(auditLogsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
      .leftJoin(tenantsTable, eq(tenantsTable.id, auditLogsTable.tenantId))
      .where(where).orderBy(desc(auditLogsTable.createdAt))
      .limit(input.limit).offset((input.page - 1) * input.limit),
    db.select({ count: sql<number>`count(*)::int` }).from(auditLogsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
      .leftJoin(tenantsTable, eq(tenantsTable.id, auditLogsTable.tenantId))
      .where(where),
    db.selectDistinct({ action: auditLogsTable.action }).from(auditLogsTable)
      .leftJoin(tenantsTable, eq(tenantsTable.id, auditLogsTable.tenantId))
      .where(and(
        sql`(${auditLogsTable.action} ILIKE 'platform_%' OR ${auditLogsTable.action} ILIKE 'TENANT_%')`,
        or(isNull(auditLogsTable.tenantId), eq(tenantsTable.isInternal, false)),
      ))
      .orderBy(asc(auditLogsTable.action)),
  ]);
  res.json({
    items: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total: count?.count ?? 0,
    page: input.page,
    limit: input.limit,
    actions: actions.map((row) => row.action),
  });
});

router.get("/platform-admin/settings", async (_req, res) => {
  res.json({ settings: await loadPlatformSettings() });
});

router.patch("/platform-admin/settings", async (req, res) => {
  const input = parseOrRespond(updatePlatformSettingsInputSchema, req.body, res);
  if (!input) return;
  const [settings] = await db.insert(platformSettingsTable).values({
    id: "global",
    ...input,
    updatedBy: req.currentUser!.id,
    updatedAt: new Date(),
  }).onConflictDoUpdate({
    target: platformSettingsTable.id,
    set: { ...input, updatedBy: req.currentUser!.id, updatedAt: new Date() },
  }).returning();
  await writeAudit({
    tenantId: null,
    userId: req.currentUser!.id,
    action: "platform_settings_updated",
    entityType: "platform_settings",
    entityId: "global",
    summary: "تحديث إعدادات المنصة",
    details: { keys: Object.keys(input) },
  });
  res.json({
    settings: {
      supportWhatsapp: settings.supportWhatsapp,
      supportPhone: settings.supportPhone,
      supportEmail: settings.supportEmail,
      defaultTrialHours: settings.defaultTrialHours,
      updatedAt: settings.updatedAt.toISOString(),
    },
  });
});

async function changeStatus(req: Request, res: Response, mode: "activate" | "suspend" | "reactivate") {
  const [tenant] = await db.select().from(tenantsTable)
    .where(and(
      eq(tenantsTable.id, String(req.params.tenantId)),
      eq(tenantsTable.isInternal, false),
    )).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "العميل غير موجود.", code: "TENANT_NOT_FOUND" });
    return;
  }
  const now = new Date();
  const values = mode === "activate"
    ? {
        status: "ACTIVE" as const,
        activatedAt: tenant.activatedAt ?? now,
        suspendedAt: null,
        updatedAt: now,
      }
    : mode === "suspend"
      ? { status: "SUSPENDED" as const, suspendedAt: now, updatedAt: now }
      : tenant.activatedAt
        ? { status: "ACTIVE" as const, suspendedAt: null, updatedAt: now }
        : tenant.trialEndsAt && tenant.trialEndsAt > now
          ? { status: "TRIAL" as const, suspendedAt: null, updatedAt: now }
          : { status: "SUSPENDED" as const, updatedAt: now };
  const [updated] = await db.update(tenantsTable).set(values)
    .where(eq(tenantsTable.id, tenant.id)).returning();
  if (mode === "activate") {
    await db.update(tenantActivationRequestsTable).set({
      workflowStatus: "ACTIVATED",
      status: "APPROVED",
      resolvedAt: now,
      resolvedByUserId: req.currentUser!.id,
      updatedAt: now,
    }).where(and(
      eq(tenantActivationRequestsTable.tenantId, tenant.id),
      eq(tenantActivationRequestsTable.status, "PENDING"),
    ));
  }
  await writeAudit({
    tenantId: tenant.id,
    userId: req.currentUser!.id,
    action: `platform_tenant_${mode}`,
    entityType: "tenant",
    entityId: tenant.id,
    summary: "إجراء إدارة منصة على حساب عميل",
  });
  res.json({ tenant: tenantDto(updated) });
}

router.post("/platform-admin/tenants/:tenantId/activate", (req, res) => void changeStatus(req, res, "activate"));
router.post("/platform-admin/tenants/:tenantId/suspend", (req, res) => void changeStatus(req, res, "suspend"));
router.post("/platform-admin/tenants/:tenantId/reactivate", (req, res) => void changeStatus(req, res, "reactivate"));

router.post("/platform-admin/tenants/:tenantId/extend-trial", async (req, res) => {
  const input = parseOrRespond(extendTrialInputSchema, req.body, res);
  if (!input) return;
  const [tenant] = await db.select().from(tenantsTable)
    .where(and(
      eq(tenantsTable.id, String(req.params.tenantId)),
      eq(tenantsTable.isInternal, false),
    )).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "العميل غير موجود.", code: "TENANT_NOT_FOUND" });
    return;
  }
  if (tenant.activatedAt) {
    res.status(409).json({
      error: "الحساب مفعّل بشكل دائم ولا يحتاج إلى تمديد فترة تجريبية.",
      code: "ACTIVE_TENANT_PERMANENT",
    });
    return;
  }
  const base = tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
  const [updated] = await db.update(tenantsTable).set({
    status: "TRIAL",
    trialStartedAt: tenant.trialStartedAt ?? new Date(),
    trialEndsAt: new Date(base.getTime() + input.days * 86400000),
    suspendedAt: null,
    updatedAt: new Date(),
  }).where(eq(tenantsTable.id, tenant.id)).returning();
  await writeAudit({
    tenantId: tenant.id,
    userId: req.currentUser!.id,
    action: "platform_tenant_extend_trial",
    entityType: "tenant",
    entityId: tenant.id,
    summary: "تمديد الفترة التجريبية",
    details: { days: input.days },
  });
  res.json({ tenant: tenantDto(updated) });
});

router.post("/platform-admin/tenants/:tenantId/users/:userId/reset-password", async (req, res) => {
  const input = parseOrRespond(resetPasswordInputSchema, req.body, res);
  if (!input) return;
  const tenantId = String(req.params.tenantId);
  const targetUserId = String(req.params.userId);
  const [tenant] = await db.select().from(tenantsTable)
    .where(and(
      eq(tenantsTable.id, tenantId),
      eq(tenantsTable.isInternal, false),
    )).limit(1);
  if (!tenant) {
    res.status(404).json({ error: "العميل غير موجود.", code: "TENANT_NOT_FOUND" });
    return;
  }
  if (tenant.status === "SUSPENDED") {
    res.status(403).json({
      error: "تم تعليق حساب العيادة. يرجى التواصل مع الدعم.",
      code: "TENANT_SUSPENDED",
    });
    return;
  }
  if (
    tenant.status === "TRIAL" &&
    (!tenant.trialEndsAt || tenant.trialEndsAt.getTime() <= Date.now())
  ) {
    res.status(403).json({
      error: "انتهت الفترة التجريبية للعيادة.",
      code: "TENANT_TRIAL_EXPIRED",
    });
    return;
  }
  const [target] = await db.select({ user: usersTable, membership: tenantMembershipsTable })
    .from(tenantMembershipsTable)
    .innerJoin(usersTable, eq(usersTable.id, tenantMembershipsTable.userId))
    .where(and(
      eq(tenantMembershipsTable.tenantId, tenantId),
      eq(tenantMembershipsTable.userId, targetUserId),
      eq(tenantMembershipsTable.role, "ADMIN"),
    )).limit(1);
  if (!target) {
    res.status(404).json({ error: "تعذر العثور على مدير المنشأة.", code: "TENANT_ADMIN_NOT_FOUND" });
    return;
  }
  const [protectedAdmin] = await db.select({ id: platformAdminsTable.userId })
    .from(platformAdminsTable).where(eq(platformAdminsTable.userId, targetUserId)).limit(1);
  if (protectedAdmin) {
    res.status(403).json({ error: "لا يمكن إعادة تعيين حساب مدير منصة.", code: "PLATFORM_ADMIN_PROTECTED" });
    return;
  }
  const temporaryPassword = input.password ?? `Ghars-${randomBytes(9).toString("base64url")}9`;
  const passwordHash = await bcrypt.hash(temporaryPassword, 12);
  await db.transaction(async (tx) => {
    await tx.update(usersTable).set({
      passwordHash,
      mustChangePassword: true,
      updatedAt: new Date(),
    }).where(eq(usersTable.id, targetUserId));
    await tx.delete(sessionsTable).where(sql`${sessionsTable.sess} ->> 'userId' = ${targetUserId}`);
    await writeAudit({
      tenantId,
      userId: req.currentUser!.id,
      action: "PLATFORM_ADMIN_RESET_TENANT_ADMIN_PASSWORD",
      entityType: "user",
      entityId: targetUserId,
      summary: "أعاد مدير المنصة تعيين كلمة مرور مدير منشأة",
    }, tx);
  });
  res.json({ temporaryPassword });
});

router.post("/platform-admin/activation-requests/:requestId/:decision", async (req, res) => {
  const input = parseOrRespond(resolveActivationRequestInputSchema, req.body, res);
  if (!input) return;
  const workflowStatus = req.params.decision === "approve" ? "CONTACTED" : req.params.decision === "reject" ? "CLOSED" : null;
  if (!workflowStatus) {
    res.status(404).json({ error: "الإجراء غير موجود.", code: "NOT_FOUND" });
    return;
  }
  const [eligible] = await db.select({ id: tenantActivationRequestsTable.id })
    .from(tenantActivationRequestsTable)
    .innerJoin(tenantsTable, eq(tenantsTable.id, tenantActivationRequestsTable.tenantId))
    .where(and(
      eq(tenantActivationRequestsTable.id, String(req.params.requestId)),
      eq(tenantsTable.isInternal, false),
    )).limit(1);
  if (!eligible) {
    res.status(404).json({ error: "طلب التفعيل غير موجود.", code: "ACTIVATION_REQUEST_NOT_FOUND" });
    return;
  }
  const [updated] = await db.update(tenantActivationRequestsTable).set({
    workflowStatus,
    status: req.params.decision === "reject" ? "REJECTED" : "PENDING",
    note: input.note,
    resolvedAt: req.params.decision === "reject" ? new Date() : null,
    resolvedByUserId: req.params.decision === "reject" ? req.currentUser!.id : null,
    updatedAt: new Date(),
  }).where(eq(tenantActivationRequestsTable.id, String(req.params.requestId))).returning();
  if (!updated) {
    res.status(404).json({ error: "طلب التفعيل غير موجود.", code: "ACTIVATION_REQUEST_NOT_FOUND" });
    return;
  }
  res.json({ request: requestDto(updated) });
});

export default router;