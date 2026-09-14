import type { Request } from "express";
import { writeAuditRequired } from "./audit";

export type ImpersonationSnapshot = {
  originalAdminId: string;
  originalTenantId?: string;
  targetUserId?: string;
  targetTenantId?: string;
  startedAt?: string;
  reason?: string;
};

export function captureImpersonation(req: Request): ImpersonationSnapshot | null {
  const originalAdminId = req.session.originalPlatformAdminId;
  if (!originalAdminId) return null;
  return {
    originalAdminId,
    originalTenantId: req.session.originalPlatformAdminTenantId,
    targetUserId: req.session.impersonationTargetUserId,
    targetTenantId: req.session.impersonationTargetTenantId,
    startedAt: req.session.impersonationStartedAt,
    reason: req.session.impersonationReason,
  };
}

export async function writeImpersonationEndedAudit(
  req: Request,
  snapshot: ImpersonationSnapshot,
  terminationReason: string,
  restoredOriginalAdmin: boolean,
): Promise<void> {
  const endedAt = new Date().toISOString();
  await writeAuditRequired({
    tenantId: snapshot.targetTenantId ?? null,
    userId: snapshot.originalAdminId,
    action: "IMPERSONATION_ENDED",
    entityType: "user",
    entityId: snapshot.targetUserId,
    summary: "انتهاء انتحال هوية مستخدم",
    details: {
      originalPlatformAdminId: snapshot.originalAdminId,
      targetUserId: snapshot.targetUserId ?? null,
      targetTenantId: snapshot.targetTenantId ?? null,
      reason: snapshot.reason ?? null,
      startedAt: snapshot.startedAt ?? null,
      endedAt,
      terminationReason,
      restoredOriginalAdmin,
      requestIp: req.ip,
      ip: req.ip,
      userAgent: req.get("user-agent") ?? null,
    },
  });
}

/**
 * End support mode before recording its lifecycle event. The returned flag is
 * authoritative for the response and audit record; callers must not ignore it.
 */
export async function endImpersonation(
  req: Request,
  snapshot: ImpersonationSnapshot,
  terminationReason: string,
  originalAdminValid: boolean,
): Promise<boolean> {
  const restoredOriginalAdmin = originalAdminValid
    ? await restoreOriginalAdmin(req, snapshot)
    : false;
  if (!originalAdminValid || !restoredOriginalAdmin) {
    if (originalAdminValid && !restoredOriginalAdmin) {
      terminationReason = terminationReason.includes("RESTORE_FAILED")
        ? terminationReason
        : `${terminationReason}_RESTORE_FAILED`;
    }
    await destroySession(req);
  }
  await writeImpersonationEndedAudit(
    req,
    snapshot,
    terminationReason,
    restoredOriginalAdmin,
  );
  return restoredOriginalAdmin;
}

export function destroySession(req: Request): Promise<void> {
  return new Promise((resolve) => req.session.destroy(() => resolve()));
}

/** Rotate the support session and restore the original admin context. */
export async function restoreOriginalAdmin(
  req: Request,
  snapshot: ImpersonationSnapshot,
): Promise<boolean> {
  try {
    await new Promise<void>((resolve, reject) =>
      req.session.regenerate((err) => (err ? reject(err) : resolve())),
    );
    req.session.userId = snapshot.originalAdminId;
    if (snapshot.originalTenantId) {
      req.session.tenantId = snapshot.originalTenantId;
    } else {
      delete req.session.tenantId;
    }
    await new Promise<void>((resolve, reject) =>
      req.session.save((err) => (err ? reject(err) : resolve())),
    );
    return true;
  } catch {
    await destroySession(req);
    return false;
  }
}