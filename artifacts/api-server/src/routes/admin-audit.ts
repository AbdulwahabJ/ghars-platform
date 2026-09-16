import { Router, type IRouter, type Request, type Response } from "express";
import {
  auditLogsTable,
  db,
  patientsTable,
  tenantMembershipsTable,
  usersTable,
} from "@workspace/db";
import {
  auditFiltersSchema,
  type AuditFilters,
  type AuditLogResponse,
} from "@workspace/shared";
import { and, asc, desc, eq, sql, type SQL } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { sendCsv, toCsv } from "../lib/csv";
import { renderPdf, renderXlsx } from "../lib/export/index.js";
import type { ReportColumn, ReportDefinition, ReportRow } from "../lib/export/index.js";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/audit-logs", requireAuth, requireRole("ADMIN"));

/**
 * Build the WHERE conditions for the audit list/export.
 * Only safe columns are ever selected — password hashes, session tokens and
 * raw `details` payloads are never exposed through this endpoint.
 */
function buildConditions(tenantId: string, filters: {
  from?: string;
  to?: string;
  userId?: string;
  action?: string;
  entityType?: string;
  fileNumber?: string;
}): SQL[] {
  const conditions: SQL[] = [eq(auditLogsTable.tenantId, tenantId)];
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
             AND ${patientsTable.tenantId} = ${tenantId}
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

type ExportLocale = "ar" | "en";

function requestedLocale(req: Request, res: Response): ExportLocale | undefined {
  const value = req.query.locale;
  if (value === undefined) return "ar";
  if (typeof value !== "string" || (value !== "ar" && value !== "en")) {
    res.status(400).json({
      error: "اللغة غير صحيحة. استخدم ar أو en.",
      code: "VALIDATION_ERROR",
    });
    return undefined;
  }
  return value;
}

async function queryAuditRows(
  tenantId: string,
  filters: AuditFilters,
) {
  const conditions = buildConditions(tenantId, filters);
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  return db
    .select(baseSelection)
    .from(auditLogsTable)
    .leftJoin(usersTable, eq(usersTable.id, auditLogsTable.userId))
    .where(where)
    .orderBy(desc(auditLogsTable.createdAt))
    .limit(10_000);
}

const AUDIT_HEADERS = {
  ar: ["التاريخ والوقت", "المستخدم", "الإجراء", "نوع السجل", "معرّف السجل", "الملخص"],
  en: ["Date and time", "User", "Action", "Entity", "Record ID", "Summary"],
} as const;

const AUDIT_LABELS: Record<string, [string, string]> = {
  audit_log: ["سجل النشاط", "Audit log"],
  user_create: ["إنشاء مستخدم", "User created"],
  data_export: ["تصدير بيانات", "Data export"],
  audit_export: ["تصدير سجل النشاط", "Audit export"],
  patient: ["مريض", "Patient"],
  implant_case: ["حالة زراعة", "Implant case"],
  payment: ["دفعة", "Payment"],
};

function auditReport(
  rows: Awaited<ReturnType<typeof queryAuditRows>>,
  locale: ExportLocale,
  filters: AuditFilters,
  clinicName: string,
): ReportDefinition {
  const language = locale === "ar" ? 0 : 1;
  const headers = AUDIT_HEADERS[locale];
  const reportRows: ReportRow[] = rows.map((row) => ({
    createdAt: row.createdAt,
    userName: row.userName ?? "",
    action: AUDIT_LABELS[row.action]?.[language] ?? row.action,
    entityType: AUDIT_LABELS[row.entityType ?? ""]?.[language] ?? row.entityType ?? "",
    entityId: row.entityId ?? "",
    summary: row.summary ?? "",
  }));
  const filterValues: Record<string, string | number> = {};
  if (filters.from) filterValues[locale === "ar" ? "من" : "From"] = filters.from;
  if (filters.to) filterValues[locale === "ar" ? "إلى" : "To"] = filters.to;
  if (filters.userId) filterValues[locale === "ar" ? "المستخدم" : "User"] = filters.userId;
  if (filters.action) filterValues[locale === "ar" ? "الإجراء" : "Action"] =
    AUDIT_LABELS[filters.action]?.[language] ?? filters.action;
  if (filters.entityType) filterValues[locale === "ar" ? "نوع السجل" : "Entity"] =
    AUDIT_LABELS[filters.entityType]?.[language] ?? filters.entityType;
  if (filters.fileNumber) filterValues[locale === "ar" ? "رقم الملف" : "File number"] = filters.fileNumber;
  return {
    metadata: {
      title: locale === "ar" ? "سجل النشاط" : "Audit log",
      subtitle: locale === "ar" ? `عدد السجلات: ${rows.length}` : `Rows: ${rows.length}`,
      clinicName,
      generatedBy: "Ghars",
      filters: filterValues,
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      orientation: "landscape",
      filename: "audit-log",
    },
    sections: [{
      title: locale === "ar" ? "سجل النشاط" : "Audit log",
      columns: headers.map((header, index): ReportColumn => ({
        key: ["createdAt", "userName", "action", "entityType", "entityId", "summary"][index],
        header,
        type: index === 0 ? "date" : "text",
        width: [20, 18, 20, 18, 25, 35][index],
      })),
      rows: reportRows,
    }],
  };
}

router.get("/admin/audit-logs", async (req, res) => {
  const filters = parseOrRespond(auditFiltersSchema, req.query, res);
  if (!filters) return;

  const tenantId = req.currentTenant!.id;
  const conditions = buildConditions(tenantId, filters);
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
     .where(eq(auditLogsTable.tenantId, tenantId))
      .orderBy(asc(auditLogsTable.action)),
    db
      .selectDistinct({ entityType: auditLogsTable.entityType })
      .from(auditLogsTable)
     .where(eq(auditLogsTable.tenantId, tenantId))
      .orderBy(asc(auditLogsTable.entityType)),
    db
      .select({ id: usersTable.id, fullName: usersTable.fullName })
     .from(usersTable)
     .innerJoin(
       tenantMembershipsTable,
       and(
         eq(tenantMembershipsTable.userId, usersTable.id),
         eq(tenantMembershipsTable.tenantId, tenantId),
       ),
     )
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

  const tenantId = req.currentTenant!.id;
  const rows = await queryAuditRows(tenantId, filters);

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
    tenantId,
    userId: req.currentUser!.id,
    action: "audit_export",
    entityType: "audit_log",
    summary: "تصدير سجل النشاط إلى CSV",
    details: {
      entity: "audit_log",
      format: "csv",
      filters,
      rowCount: rows.length,
    },
  });
  sendCsv(res, "audit-log.csv", csv);
});

async function sendAuditBinaryExport(
  req: Request,
  res: Response,
  format: "pdf" | "xlsx",
): Promise<void> {
  const filters = parseOrRespond(auditFiltersSchema, req.query, res);
  if (!filters) return;
  const locale = requestedLocale(req, res);
  if (!locale) return;
  const tenantId = req.currentTenant!.id;
  const rows = await queryAuditRows(tenantId, filters);
  const report = auditReport(rows, locale, filters, req.currentTenant!.name);
  const exported = format === "pdf"
    ? await renderPdf(report, { locale, direction: locale === "ar" ? "rtl" : "ltr" })
    : await renderXlsx(report, { locale, direction: locale === "ar" ? "rtl" : "ltr" });

  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "audit_export",
    entityType: "audit_log",
    summary: `تصدير سجل النشاط إلى ${format.toUpperCase()} (${rows.length} سجلًا)`,
    details: {
      entity: "audit_log",
      format,
      filters: { ...filters, locale },
      rowCount: rows.length,
    },
  });
  res.setHeader("Content-Type", exported.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
  res.send(exported.data);
}

router.get("/admin/audit-logs/export.pdf", async (req, res) => {
  await sendAuditBinaryExport(req, res, "pdf");
});

router.get("/admin/audit-logs/export.xlsx", async (req, res) => {
  await sendAuditBinaryExport(req, res, "xlsx");
});

export default router;
