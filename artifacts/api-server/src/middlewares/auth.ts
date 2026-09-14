import type { NextFunction, Request, Response } from "express";
import {
  db,
  platformAdminsTable,
  tenantMembershipsTable,
  tenantsTable,
  usersTable,
  type Tenant,
  type TenantMembership,
  type User,
} from "@workspace/db";
import { and, eq } from "drizzle-orm";
import type {
  TenantMembershipSummary,
  TenantSummary,
  UserRole,
} from "@workspace/shared";
import {
  captureImpersonation,
  endImpersonation,
} from "../lib/impersonation";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Loaded fresh from the database on every authenticated request. */
      currentUser?: User;
      currentTenant?: Tenant;
      currentMembership?: TenantMembership;
      tenantMemberships?: TenantMembershipSummary[];
      isPlatformAdmin?: boolean;
    }
  }
}

const UNAUTHENTICATED = {
  error: "يجب تسجيل الدخول للمتابعة.",
  code: "UNAUTHENTICATED",
};

const PASSWORD_CHANGE_ALLOWLIST = new Set([
  "GET /auth/me",
  "POST /auth/logout",
  "POST /auth/change-password",
  "POST /auth/forced-password-change",
]);

async function isActivePlatformAdmin(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .innerJoin(platformAdminsTable, eq(platformAdminsTable.userId, usersTable.id))
    .where(and(eq(usersTable.id, userId), eq(usersTable.isActive, true)))
    .limit(1);
  return !!row;
}

async function terminateImpersonation(
  req: Request,
  reason: string,
  originalAdminValid: boolean,
): Promise<boolean> {
  const snapshot = captureImpersonation(req);
  if (!snapshot) return false;
  return endImpersonation(req, snapshot, reason, originalAdminValid);
}

async function terminateAndRespond(
  req: Request,
  res: Response,
  reason: string,
  originalAdminValid: boolean,
): Promise<void> {
  let restoredOriginalAdmin = false;
  try {
    restoredOriginalAdmin = await terminateImpersonation(
      req,
      reason,
      originalAdminValid,
    );
  } catch {
    if (!originalAdminValid) {
      res.clearCookie("dfs.sid", { path: "/" });
    }
    res.status(500).json({
      error: "تعذر تسجيل انتهاء جلسة الدعم بأمان.",
      code: "IMPERSONATION_TERMINATION_FAILED",
    });
    return;
  }
  if (!restoredOriginalAdmin) {
    res.clearCookie("dfs.sid", { path: "/" });
  }
  res.status(401).json({
    error: "انتهت جلسة الدعم ويجب تسجيل الدخول مجددًا.",
    code: "IMPERSONATION_TERMINATED",
    terminationReason:
      !restoredOriginalAdmin && originalAdminValid
        ? `${reason}_RESTORE_FAILED`
        : reason,
    restoredOriginalAdmin,
  });
}

/** Authorization is enforced here on the backend, never only in the UI. */
export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const userId = req.session.userId;
  if (!userId) {
    res.status(401).json(UNAUTHENTICATED);
    return;
  }

  const impersonating = Boolean(req.session.originalPlatformAdminId);
  if (impersonating) {
    const originalAdminValid = await isActivePlatformAdmin(
      req.session.originalPlatformAdminId!,
    );
    if (!originalAdminValid) {
      await terminateAndRespond(
        req,
        res,
        "ORIGINAL_PLATFORM_ADMIN_INVALID",
        false,
      );
      return;
    }
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    if (impersonating) {
      await terminateAndRespond(req, res, "TARGET_USER_INACTIVE", true);
      return;
    }
    req.session.destroy(() => {
      res.status(401).json(UNAUTHENTICATED);
    });
    return;
  }

  const effectiveTenantId = impersonating
    ? req.session.impersonationTargetTenantId
    : req.session.tenantId;
  const context = await loadUserTenantContext(user.id, effectiveTenantId);

  // An impersonated session is pinned to the tenant selected at start. Do not
  // silently fall back to another membership if it was removed meanwhile.
  if (impersonating && (
    !req.session.impersonationTargetUserId ||
    req.session.impersonationTargetUserId !== user.id ||
    !context.current ||
    context.current.tenant.id !== req.session.impersonationTargetTenantId
  )) {
    await terminateAndRespond(
      req,
      res,
      "TARGET_MEMBERSHIP_INACTIVE_OR_SESSION_MISMATCH",
      true,
    );
    return;
  }

  if (context.current) {
    req.session.tenantId = context.current.tenant.id;
    req.currentTenant = context.current.tenant;
    req.currentMembership = context.current.membership;
  } else {
    delete req.session.tenantId;
  }

  req.currentUser = user;
  // Platform authority belongs to the original actor, never to the effective
  // impersonated user. This also prevents access to /platform-admin routes.
  req.isPlatformAdmin = impersonating ? false : context.isPlatformAdmin;
  req.tenantMemberships = context.memberships.map(({ membership, tenant }) => ({
    role: membership.role,
    isActive: membership.isActive,
    canViewFinancialsOverride: membership.canViewFinancials,
    canRecordPaymentsOverride: membership.canRecordPayments,
    tenant: toTenantSummary(tenant),
  }));

  if (user.mustChangePassword) {
    const path = req.originalUrl.split("?")[0]!.replace(/^\/api/, "");
    if (!PASSWORD_CHANGE_ALLOWLIST.has(`${req.method} ${path}`)) {
      res.status(403).json({
        error: "يجب تغيير كلمة المرور المؤقتة قبل المتابعة.",
        code: "PASSWORD_CHANGE_REQUIRED",
      });
      return;
    }
  }

  next();
}

export async function loadUserTenantContext(
  userId: string,
  preferredTenantId?: string,
) {
  const membershipRows = await db
    .select({
      membership: tenantMembershipsTable,
      tenant: tenantsTable,
    })
    .from(tenantMembershipsTable)
    .innerJoin(
      tenantsTable,
      eq(tenantsTable.id, tenantMembershipsTable.tenantId),
    )
    .where(
      and(
        eq(tenantMembershipsTable.userId, userId),
        eq(tenantMembershipsTable.isActive, true),
      ),
    );
  const [platformAdmin] = await db
    .select({ userId: platformAdminsTable.userId })
    .from(platformAdminsTable)
    .where(eq(platformAdminsTable.userId, userId))
    .limit(1);

  const selected =
    membershipRows.find(
      ({ membership }) => membership.tenantId === preferredTenantId,
    ) ?? membershipRows[0];

  return {
    memberships: membershipRows,
    current: selected,
    isPlatformAdmin: !!platformAdmin,
  };
}

export function toTenantSummary(tenant: Tenant): TenantSummary {
  return {
    id: tenant.id,
    referenceCode: tenant.referenceCode,
    name: tenant.name,
    locale: tenant.locale === "en" ? "en" : "ar",
    status: tenant.status,
    trialStartedAt: tenant.trialStartedAt?.toISOString() ?? null,
    trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
    activatedAt: tenant.activatedAt?.toISOString() ?? null,
    suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
  };
}

export function requireOperationalTenant(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (req.currentUser?.mustChangePassword) {
    res.status(403).json({
      error: "يجب تغيير كلمة المرور المؤقتة قبل المتابعة.",
      code: "PASSWORD_CHANGE_REQUIRED",
    });
    return;
  }
  const tenant = req.currentTenant;
  if (!tenant || !req.currentMembership) {
    res.status(403).json({
      error: "لا توجد عيادة متاحة لهذا الحساب.",
      code: "TENANT_ACCESS_REQUIRED",
    });
    return;
  }

  if (tenant.status === "SUSPENDED") {
    res.status(403).json({
      error: "تم تعليق حساب العيادة. يرجى التواصل مع الدعم.",
      code: "TENANT_SUSPENDED",
    });
    return;
  }
  if (tenant.status === "PENDING_VERIFICATION") {
    res.status(403).json({
      error: "يجب التحقق من البريد الإلكتروني قبل استخدام النظام.",
      code: "TENANT_EMAIL_UNVERIFIED",
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

  next();
}

/** Platform authority is an explicit marker, never a customer ADMIN role. */
export function requirePlatformAdmin(
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  if (!req.isPlatformAdmin) {
    res.status(403).json({ error: "ليست لديك صلاحية إدارة المنصة.", code: "PLATFORM_ADMIN_REQUIRED" });
    return;
  }
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const role = req.currentMembership?.role;
    if (!role || !roles.includes(role)) {
      res.status(403).json({
        error: "ليست لديك صلاحية لتنفيذ هذا الإجراء.",
        code: "FORBIDDEN",
      });
      return;
    }
    next();
  };
}
