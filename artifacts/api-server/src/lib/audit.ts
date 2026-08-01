import { auditLogsTable, db } from "@workspace/db";
import { logger } from "./logger";

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  summary?: string;
  details?: Record<string, unknown>;
}

type DbOrTx = Pick<typeof db, "insert">;

/**
 * Write an audit record. Pass a transaction handle for multi-step financial
 * writes so the audit row commits atomically with the operation.
 * Failures are logged, never thrown (except inside transactions where the
 * caller passed `tx` — there the insert error propagates intentionally).
 */
export async function writeAudit(
  entry: AuditEntry,
  dbi: DbOrTx = db,
): Promise<void> {
  const values = {
    userId: entry.userId ?? null,
    action: entry.action,
    entityType: entry.entityType ?? null,
    entityId: entry.entityId ?? null,
    summary: entry.summary ?? null,
    details: entry.details ?? null,
  };
  if (dbi !== db) {
    await dbi.insert(auditLogsTable).values(values);
    return;
  }
  try {
    await dbi.insert(auditLogsTable).values(values);
  } catch (err) {
    logger.error({ err, action: entry.action }, "failed to write audit log");
  }
}
