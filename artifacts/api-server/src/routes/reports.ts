import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  CLOSED_FOLLOWUP_STATUSES,
  FOLLOWUP_OUTCOME_STATUSES,
  OPEN_FOLLOWUP_STATUS,
  READY_CASE_STATUS,
  normalizeArabicSearchText,
  reportFiltersSchema,
  riyadhDateOf,
  toEnglishDigits,
  toCents,
  type DashboardListItem,
  type DashboardResponse,
  type OperationalReportResponse,
  type OperationalRow,
  type ReportFilters,
  type StatCount,
  type StatisticsResponse,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { effectivePermissions } from "../lib/permissions";
import { parseOrRespond } from "../lib/validation";
import { requireAuth } from "../middlewares/auth";
import { loadCaseFinancials } from "./finance";

const router: IRouter = Router();

router.use("/dashboard", requireAuth);
router.use("/statistics", requireAuth);
router.use("/reports", requireAuth);

/** Failed / needs-reimplantation implant statuses (exact Arabic copy). */
const FAILED_IMPLANT_STATUS = "فاشلة";
const REDO_IMPLANT_STATUS = "تحتاج إعادة";

const LIST_LIMIT = 8;

function financeViewAllowed(req: {
  currentUser?: { role: string } & Parameters<typeof effectivePermissions>[0];
}): boolean {
  const user = req.currentUser;
  if (!user) return false;
  return user.role === "ADMIN" || effectivePermissions(user).canViewFinancials;
}

/** Riyadh calendar date of "now" (fixed UTC+03, no DST). */
function riyadhToday(): string {
  return riyadhDateOf(new Date());
}

const num = (v: unknown): number => Number(v ?? 0);

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ------------------------------------------------------------------ */
/* GET /dashboard — live KPI counters + actionable lists               */
/* ------------------------------------------------------------------ */

router.get("/dashboard", async (req, res) => {
  const today = riyadhToday();
  const closed = CLOSED_FOLLOWUP_STATUSES as readonly string[];

  const kpiQuery = db.execute(sql`
    SELECT
      (SELECT count(*) FROM patients WHERE archived_at IS NULL) AS "activePatients",
      (SELECT count(*) FROM implant_cases ic
        JOIN patients p ON p.id = ic.patient_id
        WHERE ic.archived_at IS NULL AND p.archived_at IS NULL) AS "activeCases",
      (SELECT count(*) FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
          AND p.archived_at IS NULL) AS "activeImplants",
      (SELECT count(*) FROM followups f
        JOIN implant_cases fc ON fc.id = f.implant_case_id
        JOIN patients p ON p.id = f.patient_id
        WHERE p.archived_at IS NULL AND fc.archived_at IS NULL
          AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${today}::date
        ) AS "todayAppointments",
      (SELECT count(*) FROM followups f
        JOIN implant_cases fc ON fc.id = f.implant_case_id
        JOIN patients p ON p.id = f.patient_id
        WHERE p.archived_at IS NULL AND fc.archived_at IS NULL
          AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date < ${today}::date
        ) AS "overdueFollowups",
      (SELECT count(*) FROM implant_cases ic
        JOIN patients p ON p.id = ic.patient_id
        WHERE ic.archived_at IS NULL AND p.archived_at IS NULL
          AND ic.case_status = ${READY_CASE_STATUS}) AS "readyCases",
      (SELECT count(*) FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
          AND p.archived_at IS NULL
          AND i.implant_status IN (${FAILED_IMPLANT_STATUS}, ${REDO_IMPLANT_STATUS})
        ) AS "failedOrRedoImplants",
      (SELECT count(*) FROM followups f
        JOIN implant_cases fc ON fc.id = f.implant_case_id
        JOIN patients p ON p.id = f.patient_id
        WHERE p.archived_at IS NULL AND fc.archived_at IS NULL
          AND f.requires_contact = true
          AND f.contact_due_at IS NOT NULL
          AND (f.contact_due_at AT TIME ZONE 'Asia/Riyadh')::date <= ${today}::date
          AND f.followup_status NOT IN (${sql.join(
            closed.map((s) => sql`${s}`),
            sql`, `,
          )})
        ) AS "contactTasksDue"
  `);

  const followupList = (extra: ReturnType<typeof sql>, order: ReturnType<typeof sql>) =>
    db.execute(sql`
      SELECT f.patient_id AS "patientId", p.full_name AS "patientName",
             p.file_number AS "fileNumber", f.followup_type AS title,
             f.scheduled_at AS at, u.full_name AS "assignedUserName"
      FROM followups f
      JOIN implant_cases fc ON fc.id = f.implant_case_id
      JOIN patients p ON p.id = f.patient_id
      LEFT JOIN users u ON u.id = f.assigned_user_id
      WHERE p.archived_at IS NULL AND fc.archived_at IS NULL ${extra}
      ORDER BY ${order}
      LIMIT ${LIST_LIMIT}
    `);

  const [kpiRows, todayRows, overdueRows, readyRows, contactRows, activityRows] =
    await Promise.all([
      kpiQuery,
      followupList(
        sql`AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
            AND f.scheduled_at IS NOT NULL
            AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${today}::date`,
        sql`f.scheduled_at ASC`,
      ),
      followupList(
        sql`AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
            AND f.scheduled_at IS NOT NULL
            AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date < ${today}::date`,
        sql`f.scheduled_at ASC`,
      ),
      db.execute(sql`
        SELECT ic.patient_id AS "patientId", p.full_name AS "patientName",
               p.file_number AS "fileNumber", ic.case_status AS title,
               ic.updated_at AS at, NULL AS "assignedUserName"
        FROM implant_cases ic
        JOIN patients p ON p.id = ic.patient_id
        WHERE ic.archived_at IS NULL AND p.archived_at IS NULL
          AND ic.case_status = ${READY_CASE_STATUS}
        ORDER BY ic.updated_at DESC
        LIMIT ${LIST_LIMIT}
      `),
      followupList(
        sql`AND f.requires_contact = true
            AND f.contact_due_at IS NOT NULL
            AND (f.contact_due_at AT TIME ZONE 'Asia/Riyadh')::date <= ${today}::date
            AND f.followup_status NOT IN (${sql.join(
              closed.map((s) => sql`${s}`),
              sql`, `,
            )})`,
        sql`f.contact_due_at ASC`,
      ),
      db.execute(sql`
        SELECT a.action, a.summary, u.full_name AS "userName", a.created_at AS "createdAt"
        FROM audit_logs a
        LEFT JOIN users u ON u.id = a.user_id
        ORDER BY a.created_at DESC
        LIMIT ${LIST_LIMIT}
      `),
    ]);

  const k = kpiRows.rows[0] as Record<string, unknown>;

  let financials: DashboardResponse["financials"] = null;
  if (financeViewAllowed(req)) {
    const monthStart = `${today.slice(0, 7)}-01`;
    const [collectedRows, caseFin] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(SUM(pay.amount), 0)::text AS total
        FROM payments pay
        JOIN implant_cases ic ON ic.id = pay.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE pay.voided_at IS NULL
          AND ic.archived_at IS NULL AND p.archived_at IS NULL
          AND pay.payment_date >= ${monthStart} AND pay.payment_date <= ${today}
      `),
      loadCaseFinancials({}),
    ]);
    const collectedCents = toCents(
      Number((collectedRows.rows[0] as { total: string }).total),
    );
    const outstandingCents = caseFin.reduce(
      (acc, c) => acc + Math.max(c.finalCents - c.paidCents, 0),
      0,
    );
    financials = {
      collectedThisMonth: collectedCents / 100,
      totalOutstanding: outstandingCents / 100,
    };
  }

  const mapItems = (rows: { rows: unknown[] }): DashboardListItem[] =>
    (rows.rows as Array<Record<string, unknown>>).map((r) => ({
      patientId: String(r.patientId),
      patientName: String(r.patientName),
      fileNumber: String(r.fileNumber),
      title: String(r.title),
      at: r.at ? new Date(r.at as string).toISOString() : null,
      assignedUserName: r.assignedUserName ? String(r.assignedUserName) : null,
    }));

  const response: DashboardResponse = {
    kpis: {
      activePatients: num(k.activePatients),
      activeCases: num(k.activeCases),
      activeImplants: num(k.activeImplants),
      todayAppointments: num(k.todayAppointments),
      overdueFollowups: num(k.overdueFollowups),
      readyCases: num(k.readyCases),
      failedOrRedoImplants: num(k.failedOrRedoImplants),
      contactTasksDue: num(k.contactTasksDue),
    },
    financials,
    todayAppointments: mapItems(todayRows),
    overdueFollowups: mapItems(overdueRows),
    readyCases: mapItems(readyRows),
    contactTasks: mapItems(contactRows),
    recentActivities: (activityRows.rows as Array<Record<string, unknown>>).map(
      (r) => ({
        action: String(r.action),
        summary: r.summary ? String(r.summary) : null,
        userName: r.userName ? String(r.userName) : null,
        createdAt: new Date(r.createdAt as string).toISOString(),
      }),
    ),
  };
  res.json(response);
});

/* ------------------------------------------------------------------ */
/* Shared filter fragment: active cases within the date range          */
/* ------------------------------------------------------------------ */

/**
 * WHERE fragment selecting non-archived cases of non-archived patients whose
 * value date (procedure date, falling back to the Riyadh creation date — the
 * same definition used by the finance module) falls inside [from, to].
 */
function caseFilterFragment(filters: ReportFilters) {
  const search = filters.search ? toEnglishDigits(filters.search).trim() : "";
  const searchName = search ? normalizeArabicSearchText(search) : "";
  const searchDigits = search.replace(/\D/g, "");
  const searchConditions = [
    searchName
      ? sql`p.full_name_normalized ILIKE ${`%${escapeLike(searchName)}%`}`
      : null,
    search
      ? sql`p.file_number ILIKE ${`%${escapeLike(search)}%`}`
      : null,
    searchDigits
      ? sql`(
          p.mobile_normalized LIKE ${`%${escapeLike(searchDigits)}%`}
          OR regexp_replace(
            translate(
              COALESCE(p.mobile_number, ''),
              '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹',
              '01234567890123456789'
            ),
            '[^0-9]',
            '',
            'g'
          ) LIKE ${`%${escapeLike(searchDigits)}%`}
        )`
      : null,
  ].filter((condition): condition is ReturnType<typeof sql> => condition !== null);
  const searchFragment =
    searchConditions.length > 0
      ? sql`AND (${sql.join(searchConditions, sql` OR `)})`
      : sql``;

  return sql`
    ic.archived_at IS NULL
    AND p.archived_at IS NULL
    AND COALESCE(ic.procedure_date::text,
        (ic.created_at AT TIME ZONE 'Asia/Riyadh')::date::text)
        BETWEEN ${filters.from} AND ${filters.to}
    ${filters.treatingDoctor ? sql`AND ic.treating_doctor = ${filters.treatingDoctor}` : sql``}
    ${filters.caseStatus ? sql`AND ic.case_status = ${filters.caseStatus}` : sql``}
    ${
      filters.implantSystem
        ? sql`AND EXISTS (
            SELECT 1 FROM implants ix
            WHERE ix.implant_case_id = ic.id
              AND ix.archived_at IS NULL
              AND ix.system = ${filters.implantSystem})`
        : sql``
    }
    ${searchFragment}
  `;
}

function rangeGrouping(filters: ReportFilters): "day" | "month" {
  const days =
    (new Date(`${filters.to}T00:00:00Z`).getTime() -
      new Date(`${filters.from}T00:00:00Z`).getTime()) /
      86_400_000 +
    1;
  return days > 62 ? "month" : "day";
}

const toCounts = (rows: { rows: unknown[] }): StatCount[] =>
  (rows.rows as Array<{ name: string; count: unknown }>).map((r) => ({
    name: String(r.name),
    count: num(r.count),
  }));

/* ------------------------------------------------------------------ */
/* GET /statistics — filtered clinical statistics                      */
/* ------------------------------------------------------------------ */

router.get("/statistics", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const grouping = rangeGrouping(filters);
  const where = caseFilterFragment(filters);
  const bucketExpr =
    grouping === "day"
      ? sql`COALESCE(ic.procedure_date::text, (ic.created_at AT TIME ZONE 'Asia/Riyadh')::date::text)`
      : sql`LEFT(COALESCE(ic.procedure_date::text, (ic.created_at AT TIME ZONE 'Asia/Riyadh')::date::text), 7)`;
  const outcomes = FOLLOWUP_OUTCOME_STATUSES as readonly string[];

  const [caseBuckets, implantBuckets, systems, caseStatuses, implantStatuses, outcomeRows, reimplantRows, doctorRows] =
    await Promise.all([
      db.execute(sql`
        SELECT ${bucketExpr} AS bucket, count(*) AS count
        FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
        WHERE ${where}
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT ${bucketExpr} AS bucket, count(*) AS count
        FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND ${where}
        GROUP BY 1 ORDER BY 1
      `),
      db.execute(sql`
        SELECT i.system AS name, count(*) AS count
        FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND i.system IS NOT NULL AND ${where}
        GROUP BY 1 ORDER BY 2 DESC
      `),
      db.execute(sql`
        SELECT ic.case_status AS name, count(*) AS count
        FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
        WHERE ${where}
        GROUP BY 1 ORDER BY 2 DESC
      `),
      db.execute(sql`
        SELECT i.implant_status AS name, count(*) AS count
        FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND ${where}
        GROUP BY 1 ORDER BY 2 DESC
      `),
      db.execute(sql`
        SELECT f.followup_status AS name, count(*) AS count
        FROM followups f
        JOIN implant_cases ic ON ic.id = f.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE f.followup_status IN (${sql.join(
          outcomes.map((s) => sql`${s}`),
          sql`, `,
        )})
          AND (f.updated_at AT TIME ZONE 'Asia/Riyadh')::date
              BETWEEN ${filters.from} AND ${filters.to}
          AND ${where}
        GROUP BY 1 ORDER BY 2 DESC
      `),
      db.execute(sql`
        SELECT count(*) AS count
        FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
        WHERE ic.is_reimplantation = true AND ${where}
      `),
      db.execute(sql`
        SELECT DISTINCT ic.treating_doctor AS name
        FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
        WHERE ic.archived_at IS NULL AND p.archived_at IS NULL
        ORDER BY 1
      `),
    ]);

  const bucketMap = new Map<string, { cases: number; implants: number }>();
  for (const r of caseBuckets.rows as Array<{ bucket: string; count: unknown }>) {
    bucketMap.set(r.bucket, { cases: num(r.count), implants: 0 });
  }
  for (const r of implantBuckets.rows as Array<{ bucket: string; count: unknown }>) {
    const entry = bucketMap.get(r.bucket) ?? { cases: 0, implants: 0 };
    entry.implants = num(r.count);
    bucketMap.set(r.bucket, entry);
  }

  const implantStatusCounts = toCounts(implantStatuses);
  const findCount = (name: string) =>
    implantStatusCounts.find((c) => c.name === name)?.count ?? 0;

  const response: StatisticsResponse = {
    overTime: [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, ...v })),
    overTimeGrouping: grouping,
    implantSystems: toCounts(systems),
    caseStatuses: toCounts(caseStatuses),
    implantStatuses: implantStatusCounts,
    followupOutcomes: toCounts(outcomeRows),
    failedImplants: findCount(FAILED_IMPLANT_STATUS),
    needsRedoImplants: findCount(REDO_IMPLANT_STATUS),
    reimplantationCases: num(
      (reimplantRows.rows[0] as { count: unknown }).count,
    ),
    doctorOptions: (doctorRows.rows as Array<{ name: string }>).map(
      (r) => r.name,
    ),
  };
  res.json(response);
});

/* ------------------------------------------------------------------ */
/* Operational report (rows + CSV export)                              */
/* ------------------------------------------------------------------ */

async function buildOperationalRows(
  filters: ReportFilters,
  includeFinance: boolean,
): Promise<OperationalRow[]> {
  const today = riyadhToday();
  const rows = await db.execute(sql`
    SELECT
      ic.id AS "caseId",
      ic.patient_id AS "patientId",
      p.full_name AS "patientName",
      p.file_number AS "fileNumber",
      ic.case_status AS "caseStatus",
      ic.treating_doctor AS "treatingDoctor",
      ic.procedure_date::text AS "procedureDate",
      (SELECT count(*) FROM implants i
        WHERE i.implant_case_id = ic.id AND i.archived_at IS NULL) AS "implantCount",
      (SELECT COALESCE(array_agg(DISTINCT i.system), '{}')
        FROM implants i
        WHERE i.implant_case_id = ic.id AND i.archived_at IS NULL
          AND i.system IS NOT NULL) AS "implantSystems",
      (SELECT MIN(f.scheduled_at) FROM followups f
        WHERE f.implant_case_id = ic.id
          AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date >= ${today}::date
        ) AS "nextFollowupAt",
      EXISTS (SELECT 1 FROM followups f
        WHERE f.implant_case_id = ic.id
          AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date < ${today}::date
        ) AS "isOverdue"
    FROM implant_cases ic
    JOIN patients p ON p.id = ic.patient_id
    WHERE ${caseFilterFragment(filters)}
    ORDER BY p.full_name ASC, ic.created_at ASC
  `);

  const financeByCase = new Map<
    string,
    { finalCents: number; paidCents: number; status: string }
  >();
  if (includeFinance) {
    for (const c of await loadCaseFinancials({})) {
      financeByCase.set(c.id, c);
    }
  }

  return (rows.rows as Array<Record<string, unknown>>).map((r) => {
    const fin = includeFinance ? financeByCase.get(String(r.caseId)) : undefined;
    return {
      caseId: String(r.caseId),
      patientId: String(r.patientId),
      patientName: String(r.patientName),
      fileNumber: String(r.fileNumber),
      caseStatus: String(r.caseStatus),
      treatingDoctor: String(r.treatingDoctor),
      procedureDate: r.procedureDate ? String(r.procedureDate) : null,
      implantCount: num(r.implantCount),
      implantSystems: (r.implantSystems as string[] | null) ?? [],
      nextFollowupAt: r.nextFollowupAt
        ? new Date(r.nextFollowupAt as string).toISOString()
        : null,
      isOverdue: Boolean(r.isOverdue),
      isReady: String(r.caseStatus) === READY_CASE_STATUS,
      finance: fin
        ? {
            finalTotal: fin.finalCents / 100,
            paid: fin.paidCents / 100,
            remaining: (fin.finalCents - fin.paidCents) / 100,
            // Show neutral "غير محدد" when there is no financial obligation at all
            paymentStatus:
              fin.finalCents === 0 && fin.paidCents === 0
                ? "غير محدد"
                : fin.status,
          }
        : null,
    };
  });
}

router.get("/reports/operational", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const includeFinance = financeViewAllowed(req);
  const rows = await buildOperationalRows(filters, includeFinance);
  const response: OperationalReportResponse = {
    rows,
    financialsIncluded: includeFinance,
  };
  res.json(response);
});

const csvEscape = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

router.get("/reports/operational/export.csv", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const includeFinance = financeViewAllowed(req);
  const rows = await buildOperationalRows(filters, includeFinance);

  const headers = [
    "المريض",
    "رقم الملف",
    "حالة الحالة",
    "الطبيب المعالج",
    "تاريخ العملية",
    "عدد الزرعات",
    "أنظمة الزرعات",
    "المتابعة القادمة",
    "متأخرة",
    "جاهزة للتركيب",
    ...(includeFinance
      ? ["الإجمالي النهائي", "المدفوع", "المتبقي", "حالة السداد"]
      : []),
  ];
  const lines = rows.map((r) =>
    [
      r.patientName,
      r.fileNumber,
      r.caseStatus,
      r.treatingDoctor,
      r.procedureDate ?? "",
      String(r.implantCount),
      r.implantSystems.join("، "),
      r.nextFollowupAt ? riyadhDateOf(r.nextFollowupAt) : "",
      r.isOverdue ? "نعم" : "لا",
      r.isReady ? "نعم" : "لا",
      ...(r.finance
        ? [
            r.finance.finalTotal.toFixed(2),
            r.finance.paid.toFixed(2),
            r.finance.remaining.toFixed(2),
            r.finance.paymentStatus,
          ]
        : includeFinance
          ? ["", "", "", ""]
          : []),
    ]
      .map(csvEscape)
      .join(","),
  );
  const csv = "\uFEFF" + [headers.join(","), ...lines].join("\r\n");

  await writeAudit({
    userId: req.currentUser?.id,
    action: "report_export",
    entityType: "report",
    summary: `تصدير التقرير التشغيلي (${filters.from} إلى ${filters.to}) — ${rows.length} صف`,
    details: { filters, rowCount: rows.length, includeFinance },
  });

  res
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="operational-report-${filters.from}-${filters.to}.csv"`,
    )
    .send(csv);
});

export default router;
