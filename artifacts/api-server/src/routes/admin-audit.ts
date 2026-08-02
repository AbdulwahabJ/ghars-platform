import { Router, type IRouter } from "express";
import { auditLogsTable, db, patientsTable, usersTable } from "@workspace/db";
import { auditFiltersSchema, type AuditLogResponse } from "@workspace/shared";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { sendCsv, toCsv } from "../lib/csv";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/audit-logs", requireAuth, requireRole("ADMIN"));

/**
 * Build the WHERE conditions for the audit list/export.
 * Only safe columns are ever selected — password hashes, session tokens and
 * raw `details` payloads are never exposed through this endpoint.
 */
function buildConditions(filters: {
  from?: string;
  to?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  fileNumber?: string;
}): SQL[] {
  const conditions: SQL[] = [];
  if (filters.from) {
    conditions.push(
      sql`(${auditLogsTable.createdAt} AT TIME ZONE 'Asia/Riyadh')::date >= ${filters.from}::date`,
    );
  }
  if (filters.to) {
    conditions.push(
      sql`(${auditLogsTable.createdAt} AT TIME ZONE 'Asia/Riyadh')::date <= ${filters.to}::date`,
    );
  }
  if (filters.userId) {
    conditions.push(eq(auditLogsTable.userId, filters.userId));
  }
  if (filters.action) {
    conditions.push(eq(auditLogsTable.action, filters.action));
  }
  if (filters.entityType) {
    conditions.push(eq(auditLogsTable.entityType, filters.entityType));
  }
  if (filters.fileNumber) {
    conditions.push(sql`(
      ${auditLogsTable.details} ->> 'fileNumber' = ${filters.fileNumber}
      OR (
        ${auditLogsTable.entityType} = 'patient'
        AND ${auditLogsTable.entityId} IN (
          SELECT id::text FROM ${patientsTable}
          WHERE ${patientsTable.fileNumber} = ${filters.fileNumber}
        )
      )
    )`);
  }
  return conditions;
}

const baseSelection = {
  id: auditLogsTable.id,
  createdAt: auditLogsTable.createdAt,
  action: auditLogsTable.action,
  entityType: auditLogsTable.entityType,
  entityId: auditLogsTable.entityId,
  summary: auditLogsTable.summary,
  userName: usersTable.fullName,
};

router.get("/admin/audit-logs", async (req, res) => {
  const filters = parseOrRespond(auditFiltersSchema, req.query, res);
  if (!filters) return;

  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [items, [countRow], actions, entityTypes, users] = await Promise.all([
    db
      .select(baseSelection)
      .from(auditLogsTable)
      .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
      .where(where)
      .orderBy(desc(auditLogsTable.createdAt))
      .limit(filters.limit)
      .offset((filters.page - 1) * filters.limit),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogsTable)
      .where(where),
    db
      .selectDistinct({ action: auditLogsTable.action })
      .from(auditLogsTable)
      .orderBy(asc(auditLogsTable.action)),
    db
      .selectDistinct({ entityType: auditLogsTable.entityType })
      .from(auditLogsTable)
      .orderBy(asc(auditLogsTable.entityType)),
    db
      .select({ id: usersTable.id, fullName: usersTable.fullName })
      .from(usersTable)
      .orderBy(asc(usersTable.fullName)),
  ]);

  const body: AuditLogResponse = {
    items: items.map((row) => ({
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      userName: row.userName ?? null,
      action: row.action,
      entityType: row.entityType,
      entityId: row.entityId,
      summary: row.summary,
    })),
    total: countRow?.count ?? 0,
    page: filters.page,
    limit: filters.limit,
    actions: actions.map((a) => a.action),
    entityTypes: entityTypes
      .map((e) => e.entityType)
      .filter((e): e is string => !!e),
    users,
  };
  res.json(body);
});

router.get("/admin/audit-logs/export.csv", async (req, res) => {
  const filters = parseOrRespond(auditFiltersSchema, req.query, res);
  if (!filters) return;

  const conditions = buildConditions(filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = await db
    .select(baseSelection)
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(10_000);

  const csv = toCsv(
    ["التاريخ والوقت", "المستخدم", "الإجراء", "نوع السجل", "معرّف السجل", "الملخص"],
    rows.map((row) => [
      row.createdAt.toISOString(),
      row.userName ?? "",
      row.action,
      row.entityType ?? "",
      row.entityId ?? "",
      row.summary ?? "",
    ]),
  );

  await writeAudit({
    userId: req.currentUser!.id,
    action: "audit_export",
    entityType: "audit_log",
    summary: "تصدير سجل النشاط إلى CSV",
    details: { rowCount: rows.length },
  });
  sendCsv(res, "audit-log.csv", csv);
});

export default router;
