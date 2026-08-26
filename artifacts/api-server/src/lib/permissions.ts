import type { TenantMembership, User } from "@workspace/db";
import type { PublicUser, UserRole } from "@workspace/shared";

/**
 * Role defaults per the specification:
 * - ADMIN: full access.
 * - DOCTOR: views financial summaries ONLY if explicitly enabled.
 * - ASSISTANT: records payments ONLY if the Admin enables it.
 * Effective permission = user-level override (non-null) ?? role default.
 */
const ROLE_DEFAULTS: Record<
  UserRole,
  { canViewFinancials: boolean; canRecordPayments: boolean }
> = {
  ADMIN: { canViewFinancials: true, canRecordPayments: true },
  DOCTOR: { canViewFinancials: false, canRecordPayments: false },
  ASSISTANT: { canViewFinancials: false, canRecordPayments: false },
};

export function effectivePermissions(
  membership: Pick<
    TenantMembership,
    "role" | "canViewFinancials" | "canRecordPayments"
  >,
): {
  canViewFinancials: boolean;
  canRecordPayments: boolean;
} {
  const defaults = ROLE_DEFAULTS[membership.role];
  return {
    canViewFinancials:
      membership.canViewFinancials ?? defaults.canViewFinancials,
    canRecordPayments:
      membership.canRecordPayments ?? defaults.canRecordPayments,
  };
}

export function toPublicUser(
  user: User,
  membership: Pick<
    TenantMembership,
    "role" | "canViewFinancials" | "canRecordPayments"
  >,
): PublicUser {
  const perms = effectivePermissions(membership);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: membership.role,
    canViewFinancials: perms.canViewFinancials,
    canRecordPayments: perms.canRecordPayments,
    avatarData: user.avatarData ?? null,
  };
}
