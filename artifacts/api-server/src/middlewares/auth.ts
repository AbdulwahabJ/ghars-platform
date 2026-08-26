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

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, userId))
    .limit(1);

  if (!user || !user.isActive) {
    req.session.destroy(() => {
      res.status(401).json(UNAUTHENTICATED);
    });
    return;
  }

  const context = await loadUserTenantContext(user.id, req.session.tenantId);

  if (context.current) {
    req.session.tenantId = context.current.tenant.id;
    req.currentTenant = context.current.tenant;
    req.currentMembership = context.current.membership;
  } else {
    delete req.session.tenantId;
  }

  req.currentUser = user;
  req.isPlatformAdmin = context.isPlatformAdmin;
  req.tenantMemberships = context.memberships.map(({ membership, tenant }) => ({
    role: membership.role,
    isActive: membership.isActive,
    canViewFinancialsOverride: membership.canViewFinancials,
    canRecordPaymentsOverride: membership.canRecordPayments,
    tenant: toTenantSummary(tenant),
  }));
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
