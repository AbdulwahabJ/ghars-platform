import type { User } from "@workspace/db";
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

export function effectivePermissions(user: User): {
  canViewFinancials: boolean;
  canRecordPayments: boolean;
} {
  const defaults = ROLE_DEFAULTS[user.role];
  return {
    canViewFinancials: user.canViewFinancials ?? defaults.canViewFinancials,
    canRecordPayments: user.canRecordPayments ?? defaults.canRecordPayments,
  };
}

export function toPublicUser(user: User): PublicUser {
  const perms = effectivePermissions(user);
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    canViewFinancials: perms.canViewFinancials,
    canRecordPayments: perms.canRecordPayments,
    avatarData: user.avatarData ?? null,
  };
}
