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
  type StatisticsHub,
  type StatisticsResponse,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { renderPdf } from "../lib/export/pdf";
import { renderXlsx } from "../lib/export/xlsx";
import type {
  ReportColumn,
  ReportDefinition,
  ReportLocale,
  ReportRow,
} from "../lib/export/types";
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
  currentMembership?: Parameters<typeof effectivePermissions>[0];
}): boolean {
  const membership = req.currentMembership;
  if (!membership) return false;
  return membership.role === "ADMIN" ||
    effectivePermissions(membership).canViewFinancials;
}

/** Riyadh calendar date of "now" (fixed UTC+03, no DST). */
function riyadhToday(): string {
  return riyadhDateOf(new Date());
}

const num = (v: unknown): number => Number(v ?? 0);
const stringList = (value: unknown): string[] =>
  Array.isArray(value)
    ? value
        .map(String)
        .map((item) => item.trim())
        .filter(Boolean)
    : [];

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/* ------------------------------------------------------------------ */
/* GET /dashboard — live KPI counters + actionable lists               */
/* ------------------------------------------------------------------ */

router.get("/dashboard", async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const today = riyadhToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const closed = CLOSED_FOLLOWUP_STATUSES as readonly string[];

  const kpiQuery = db.execute(sql`
    SELECT
       (SELECT count(*) FROM patients WHERE archived_at IS NULL AND tenant_id = ${tenantId}) AS "activePatients",
      (SELECT count(*) FROM implant_cases ic
        JOIN patients p ON p.id = ic.patient_id
        WHERE ic.archived_at IS NULL AND p.archived_at IS NULL AND ic.tenant_id = ${tenantId}) AS "activeCases",
      (SELECT count(*) FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
          AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}) AS "activeImplants",
      (SELECT count(*) FROM followups f
        JOIN implant_cases fc ON fc.id = f.implant_case_id
        JOIN patients p ON p.id = f.patient_id
        WHERE p.archived_at IS NULL AND fc.archived_at IS NULL AND f.tenant_id = ${tenantId}
          AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${today}::date
        ) AS "todayAppointments",
      (SELECT count(*) FROM followups f
        JOIN implant_cases fc ON fc.id = f.implant_case_id
        JOIN patients p ON p.id = f.patient_id
        WHERE p.archived_at IS NULL AND fc.archived_at IS NULL AND f.tenant_id = ${tenantId}
          AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date < ${today}::date
        ) AS "overdueFollowups",
      (SELECT count(*) FROM implant_cases ic
        JOIN patients p ON p.id = ic.patient_id
        WHERE ic.archived_at IS NULL AND p.archived_at IS NULL AND ic.tenant_id = ${tenantId}
          AND ic.case_status = ${READY_CASE_STATUS}) AS "readyCases",
      (SELECT count(*) FROM implants i
        JOIN implant_cases ic ON ic.id = i.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
          AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
          AND i.implant_status IN (${FAILED_IMPLANT_STATUS}, ${REDO_IMPLANT_STATUS})
        ) AS "failedOrRedoImplants",
      (SELECT count(*) FROM followups f
        JOIN implant_cases fc ON fc.id = f.implant_case_id
        JOIN patients p ON p.id = f.patient_id
        WHERE p.archived_at IS NULL AND fc.archived_at IS NULL AND f.tenant_id = ${tenantId}
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
       WHERE p.archived_at IS NULL AND fc.archived_at IS NULL
         AND f.tenant_id = ${tenantId} ${extra}
      ORDER BY ${order}
      LIMIT ${LIST_LIMIT}
    `);

  const workSummaryQuery = db.execute(sql`
    SELECT
      (SELECT count(DISTINCT p.id)
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date = ${today}::date) AS "todayImplantedPatients",
      (SELECT count(*)
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date = ${today}::date) AS "todayImplants",
      (SELECT count(DISTINCT NULLIF(btrim(i.system), ''))
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date = ${today}::date) AS "todaySystemCount",
      (SELECT COALESCE(array_agg(DISTINCT i.system) FILTER (
          WHERE NULLIF(btrim(i.system), '') IS NOT NULL
        ), ARRAY[]::text[])
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date = ${today}::date) AS "todaySystemNames",
      (SELECT count(DISTINCT ic.patient_id)
       FROM prosthetic_events pe
       JOIN implant_cases ic ON ic.id = pe.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       LEFT JOIN implants i ON i.id = pe.implant_id
       WHERE pe.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND pe.tenant_id = ${tenantId}
         AND (pe.implant_id IS NULL OR i.archived_at IS NULL)
         AND pe.event_date = ${today}::date) AS "todayProstheticPatients",
      (SELECT count(*)
       FROM prosthetic_events pe
       JOIN implant_cases ic ON ic.id = pe.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       LEFT JOIN implants i ON i.id = pe.implant_id
       WHERE pe.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND pe.tenant_id = ${tenantId}
         AND (pe.implant_id IS NULL OR i.archived_at IS NULL)
         AND pe.event_date = ${today}::date) AS "todayCompletedProsthetics",
      (SELECT count(DISTINCT p.id)
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date >= ${monthStart}::date
         AND ic.procedure_date <= ${today}::date) AS "monthImplantedPatients",
      (SELECT count(*)
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date >= ${monthStart}::date
         AND ic.procedure_date <= ${today}::date) AS "monthImplants",
      (SELECT count(DISTINCT NULLIF(btrim(i.system), ''))
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date >= ${monthStart}::date
         AND ic.procedure_date <= ${today}::date) AS "monthSystemCount",
      (SELECT COALESCE(array_agg(DISTINCT i.system) FILTER (
          WHERE NULLIF(btrim(i.system), '') IS NOT NULL
        ), ARRAY[]::text[])
       FROM implants i
       JOIN implant_cases ic ON ic.id = i.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       WHERE i.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND i.tenant_id = ${tenantId}
         AND ic.procedure_date >= ${monthStart}::date
         AND ic.procedure_date <= ${today}::date) AS "monthSystemNames",
      (SELECT count(DISTINCT ic.patient_id)
       FROM prosthetic_events pe
       JOIN implant_cases ic ON ic.id = pe.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       LEFT JOIN implants i ON i.id = pe.implant_id
       WHERE pe.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND pe.tenant_id = ${tenantId}
         AND (pe.implant_id IS NULL OR i.archived_at IS NULL)
         AND pe.event_date >= ${monthStart}::date
         AND pe.event_date <= ${today}::date) AS "monthProstheticPatients",
      (SELECT count(*)
       FROM prosthetic_events pe
       JOIN implant_cases ic ON ic.id = pe.implant_case_id
       JOIN patients p ON p.id = ic.patient_id
       LEFT JOIN implants i ON i.id = pe.implant_id
       WHERE pe.archived_at IS NULL AND ic.archived_at IS NULL
         AND p.archived_at IS NULL AND pe.tenant_id = ${tenantId}
         AND (pe.implant_id IS NULL OR i.archived_at IS NULL)
         AND pe.event_date >= ${monthStart}::date
         AND pe.event_date <= ${today}::date) AS "monthCompletedProsthetics"
  `);

  const [kpiRows, workSummaryRows, todayRows, overdueRows, readyRows, contactRows, activityRows] =
    await Promise.all([
      kpiQuery,
      workSummaryQuery,
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
           AND ic.tenant_id = ${tenantId}
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
         WHERE a.tenant_id = ${tenantId}
         ORDER BY a.created_at DESC
        LIMIT ${LIST_LIMIT}
      `),
    ]);

  const k = kpiRows.rows[0] as Record<string, unknown>;
  const w = workSummaryRows.rows[0] as Record<string, unknown>;

  let financials: DashboardResponse["financials"] = null;
  if (financeViewAllowed(req)) {
    const [collectedRows, caseFin] = await Promise.all([
      db.execute(sql`
        SELECT COALESCE(SUM(pay.amount), 0)::text AS total
        FROM payments pay
        JOIN implant_cases ic ON ic.id = pay.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE pay.voided_at IS NULL
          AND ic.archived_at IS NULL AND p.archived_at IS NULL
           AND pay.tenant_id = ${tenantId}
          AND pay.payment_date >= ${monthStart} AND pay.payment_date <= ${today}
      `),
      loadCaseFinancials({}, tenantId),
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
    workSummary: {
      today: {
        implantedPatients: num(w.todayImplantedPatients),
        implants: num(w.todayImplants),
        implantSystems: {
          count: num(w.todaySystemCount),
          names: stringList(w.todaySystemNames),
        },
        prostheticPatients: num(w.todayProstheticPatients),
        completedProsthetics: num(w.todayCompletedProsthetics),
      },
      month: {
        implantedPatients: num(w.monthImplantedPatients),
        implants: num(w.monthImplants),
        implantSystems: {
          count: num(w.monthSystemCount),
          names: stringList(w.monthSystemNames),
        },
        prostheticPatients: num(w.monthProstheticPatients),
        completedProsthetics: num(w.monthCompletedProsthetics),
      },
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
function caseFilterFragment(filters: ReportFilters, tenantId: string) {
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
    ic.tenant_id = ${tenantId}
    AND ic.archived_at IS NULL
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
    ${
      filters.implantStatus
        ? sql`AND EXISTS (
            SELECT 1 FROM implants ix
            WHERE ix.implant_case_id = ic.id
              AND ix.archived_at IS NULL
              AND ix.implant_status = ${filters.implantStatus})`
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

const toMetricBuckets = (rows: { rows: unknown[] }) =>
  (rows.rows as Array<{ bucket: string; count: unknown }>).map((row) => ({
    bucket: String(row.bucket),
    count: num(row.count),
  }));

function firstRow(result: { rows: unknown[] }): Record<string, unknown> {
  return (result.rows[0] as Record<string, unknown> | undefined) ?? {};
}

async function buildStatisticsHub(
  filters: ReportFilters,
  where: ReturnType<typeof sql>,
  grouping: "day" | "month",
  includeFinancials: boolean,
  tenantId: string,
): Promise<StatisticsHub> {
  const followupBucketExpr = grouping === "day"
    ? sql`(f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date::text`
    : sql`LEFT((f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date::text, 7)`;
  const communicationBucketExpr = grouping === "day"
    ? sql`(c.created_at AT TIME ZONE 'Asia/Riyadh')::date::text`
    : sql`LEFT((c.created_at AT TIME ZONE 'Asia/Riyadh')::date::text, 7)`;
  const prostheticBucketExpr = grouping === "day"
    ? sql`pe.event_date::text`
    : sql`LEFT(pe.event_date::text, 7)`;
  const boneGraftBucketExpr = grouping === "day"
    ? sql`bgp.procedure_date::text`
    : sql`LEFT(bgp.procedure_date::text, 7)`;
  const today = riyadhToday();

  const [
    overviewRows,
    readyCaseRows,
    patientTrendRows,
    prostheticSummaryRows,
    prostheticTrendRows,
    prostheticDoctorRows,
    boneGraftSummaryRows,
    boneGraftTrendRows,
    boneGraftTypeRows,
    boneGraftMaterialRows,
    boneGraftStatusRows,
    followupSummaryRows,
    followupTrendRows,
    followupTypesRows,
    followupOutcomesRows,
    followupAssigneesRows,
    communicationSummaryRows,
    communicationTrendRows,
    communicationResultsRows,
    communicationReasonsRows,
    doctorRows,
    financeSummaryRows,
    paymentMethodsRows,
    paymentStatusesRows,
    collectionTrendRows,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        (SELECT count(DISTINCT p.id)
         FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
         WHERE ${where}) AS patients,
        (SELECT count(DISTINCT p.id)
         FROM implants i
         JOIN implant_cases ic ON ic.id = i.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE i.archived_at IS NULL AND ${where}) AS "implantedPatients",
        (SELECT count(*)
         FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
         WHERE ${where}) AS cases,
        (SELECT count(*)
         FROM implants i
         JOIN implant_cases ic ON ic.id = i.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE i.archived_at IS NULL AND ${where}) AS implants,
        (SELECT count(DISTINCT NULLIF(btrim(i.system), ''))
         FROM implants i
         JOIN implant_cases ic ON ic.id = i.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE i.archived_at IS NULL AND ${where}) AS systems,
        (SELECT count(DISTINCT p.id)
         FROM prosthetic_events pe
         JOIN implant_cases ic ON ic.id = pe.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE pe.archived_at IS NULL AND ${where}
           AND pe.event_date BETWEEN ${filters.from} AND ${filters.to}) AS "prostheticPatients",
        (SELECT count(*)
         FROM prosthetic_events pe
         JOIN implant_cases ic ON ic.id = pe.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE pe.archived_at IS NULL AND ${where}
           AND pe.event_date BETWEEN ${filters.from} AND ${filters.to}) AS "prostheticEvents",
        (SELECT count(*)
         FROM followups f
         JOIN implant_cases ic ON ic.id = f.implant_case_id
         JOIN patients p ON p.id = f.patient_id
         WHERE ${where}
           AND COALESCE(f.scheduled_at, f.updated_at AT TIME ZONE 'UTC')
               BETWEEN ${filters.from}::date AND (${filters.to}::date + 1)) AS followups,
        (SELECT count(*)
         FROM followups f
         JOIN implant_cases ic ON ic.id = f.implant_case_id
         JOIN patients p ON p.id = f.patient_id
         WHERE ${where}
           AND f.followup_status = ${OPEN_FOLLOWUP_STATUS}
           AND f.scheduled_at IS NOT NULL
           AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date < ${today}::date) AS "overdueFollowups",
        (SELECT count(*)
         FROM implants i
         JOIN implant_cases ic ON ic.id = i.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE i.archived_at IS NULL AND i.implant_status = ${FAILED_IMPLANT_STATUS}
           AND ${where}) AS "failedImplants",
        (SELECT count(*)
         FROM implants i
         JOIN implant_cases ic ON ic.id = i.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE i.archived_at IS NULL AND i.implant_status = ${REDO_IMPLANT_STATUS}
           AND ${where}) AS "needsRedoImplants"
        ,
        (SELECT count(*)
         FROM bone_graft_procedures bgp
         JOIN implant_cases ic ON ic.id = bgp.implant_case_id
         JOIN patients p ON p.id = ic.patient_id
         WHERE bgp.archived_at IS NULL AND ${where}
           AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}) AS "boneGraftProcedures"
    `),
    db.execute(sql`
      SELECT count(*) AS count
      FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
      WHERE ic.case_status = ${READY_CASE_STATUS} AND ${where}
    `),
    db.execute(sql`
      SELECT (p.created_at AT TIME ZONE 'Asia/Riyadh')::date::text AS bucket,
             count(DISTINCT p.id) AS count
      FROM patients p
      JOIN implant_cases ic ON ic.patient_id = p.id
       WHERE p.archived_at IS NULL AND p.tenant_id = ${tenantId}
        AND (p.created_at AT TIME ZONE 'Asia/Riyadh')::date
            BETWEEN ${filters.from} AND ${filters.to}
        AND ${where}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT
        count(DISTINCT p.id) AS patients,
        count(*) AS events,
        count(*) FILTER (WHERE pe.event_type = 'تركيب مؤقت') AS temporary,
        count(*) FILTER (WHERE pe.event_type = 'تركيب دائم') AS permanent
      FROM prosthetic_events pe
      JOIN implant_cases ic ON ic.id = pe.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE pe.archived_at IS NULL AND ${where}
        AND pe.event_date BETWEEN ${filters.from} AND ${filters.to}
    `),
    db.execute(sql`
      SELECT ${prostheticBucketExpr} AS bucket, count(*) AS count
      FROM prosthetic_events pe
      JOIN implant_cases ic ON ic.id = pe.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE pe.archived_at IS NULL AND ${where}
        AND pe.event_date BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT ic.treating_doctor AS name, count(*) AS count
      FROM prosthetic_events pe
      JOIN implant_cases ic ON ic.id = pe.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE pe.archived_at IS NULL AND ${where}
        AND pe.event_date BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT
        count(*) AS total,
        count(DISTINCT ic.patient_id) AS patients,
        count(DISTINCT ic.id) AS cases
      FROM bone_graft_procedures bgp
      JOIN implant_cases ic ON ic.id = bgp.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE bgp.archived_at IS NULL AND ${where}
        AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
    `),
    db.execute(sql`
      SELECT ${boneGraftBucketExpr} AS bucket, count(*) AS count
      FROM bone_graft_procedures bgp
      JOIN implant_cases ic ON ic.id = bgp.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE bgp.archived_at IS NULL AND ${where}
        AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT bgp.procedure_category AS name, count(*) AS count
      FROM bone_graft_procedures bgp
      JOIN implant_cases ic ON ic.id = bgp.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE bgp.archived_at IS NULL AND ${where}
        AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(btrim(bgp.material), ''), 'غير محدد') AS name, count(*) AS count
      FROM bone_graft_procedures bgp
      JOIN implant_cases ic ON ic.id = bgp.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE bgp.archived_at IS NULL AND ${where}
        AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT bgp.procedure_status AS name, count(*) AS count
      FROM bone_graft_procedures bgp
      JOIN implant_cases ic ON ic.id = bgp.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE bgp.archived_at IS NULL AND ${where}
        AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT
        count(*) AS total,
        count(*) FILTER (WHERE f.followup_status = ${OPEN_FOLLOWUP_STATUS}) AS scheduled,
        count(*) FILTER (WHERE f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date = ${today}::date) AS "dueToday",
        count(*) FILTER (WHERE f.followup_status = ${OPEN_FOLLOWUP_STATUS}
          AND f.scheduled_at IS NOT NULL
          AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date < ${today}::date) AS overdue,
        count(*) FILTER (WHERE f.followup_status IN (${sql.join(
          (FOLLOWUP_OUTCOME_STATUSES as readonly string[]).map((s) => sql`${s}`),
          sql`, `,
        )})) AS completed,
        count(*) FILTER (WHERE f.followup_status IN ('ملغاة', 'ملغي')) AS cancelled,
        count(*) FILTER (WHERE f.followup_status = 'تحتاج إعادة تواصل') AS "needsRecontact"
      FROM followups f
      JOIN implant_cases ic ON ic.id = f.implant_case_id
      JOIN patients p ON p.id = f.patient_id
      WHERE ${where}
        AND COALESCE(f.scheduled_at, f.updated_at AT TIME ZONE 'UTC')
            BETWEEN ${filters.from}::date AND (${filters.to}::date + 1)
    `),
    db.execute(sql`
      SELECT ${followupBucketExpr} AS bucket, count(*) AS count
      FROM followups f
      JOIN implant_cases ic ON ic.id = f.implant_case_id
      JOIN patients p ON p.id = f.patient_id
      WHERE ${where} AND f.scheduled_at IS NOT NULL
        AND (f.scheduled_at AT TIME ZONE 'Asia/Riyadh')::date
            BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT f.followup_type AS name, count(*) AS count
      FROM followups f
      JOIN implant_cases ic ON ic.id = f.implant_case_id
      JOIN patients p ON p.id = f.patient_id
      WHERE ${where}
        AND COALESCE(f.scheduled_at, f.updated_at AT TIME ZONE 'UTC')
            BETWEEN ${filters.from}::date AND (${filters.to}::date + 1)
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT f.followup_status AS name, count(*) AS count
      FROM followups f
      JOIN implant_cases ic ON ic.id = f.implant_case_id
      JOIN patients p ON p.id = f.patient_id
      WHERE ${where}
        AND COALESCE(f.scheduled_at, f.updated_at AT TIME ZONE 'UTC')
            BETWEEN ${filters.from}::date AND (${filters.to}::date + 1)
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT COALESCE(u.full_name, 'غير محدد') AS name, count(*) AS count
      FROM followups f
      JOIN implant_cases ic ON ic.id = f.implant_case_id
      JOIN patients p ON p.id = f.patient_id
      LEFT JOIN users u ON u.id = f.assigned_user_id
      WHERE ${where}
        AND COALESCE(f.scheduled_at, f.updated_at AT TIME ZONE 'UTC')
            BETWEEN ${filters.from}::date AND (${filters.to}::date + 1)
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT count(*) AS total,
             count(*) FILTER (WHERE c.communication_result IS NOT NULL) AS "withResults"
      FROM communications c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN implant_cases ic ON ic.id = c.implant_case_id
       WHERE p.archived_at IS NULL AND c.tenant_id = ${tenantId}
        AND (ic.id IS NULL OR ${where})
        AND (c.created_at AT TIME ZONE 'Asia/Riyadh')::date
            BETWEEN ${filters.from} AND ${filters.to}
    `),
    db.execute(sql`
      SELECT ${communicationBucketExpr} AS bucket, count(*) AS count
      FROM communications c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN implant_cases ic ON ic.id = c.implant_case_id
       WHERE p.archived_at IS NULL AND c.tenant_id = ${tenantId}
        AND (ic.id IS NULL OR ${where})
        AND (c.created_at AT TIME ZONE 'Asia/Riyadh')::date
            BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 1
    `),
    db.execute(sql`
      SELECT COALESCE(c.communication_result, 'بدون نتيجة') AS name, count(*) AS count
      FROM communications c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN implant_cases ic ON ic.id = c.implant_case_id
       WHERE p.archived_at IS NULL AND c.tenant_id = ${tenantId}
        AND (ic.id IS NULL OR ${where})
        AND (c.created_at AT TIME ZONE 'Asia/Riyadh')::date
            BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(btrim(c.communication_reason), ''), 'غير محدد') AS name,
             count(*) AS count
      FROM communications c
      JOIN patients p ON p.id = c.patient_id
      LEFT JOIN implant_cases ic ON ic.id = c.implant_case_id
       WHERE p.archived_at IS NULL AND c.tenant_id = ${tenantId}
        AND (ic.id IS NULL OR ${where})
        AND (c.created_at AT TIME ZONE 'Asia/Riyadh')::date
            BETWEEN ${filters.from} AND ${filters.to}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT ic.treating_doctor AS name,
             count(DISTINCT p.id) AS patients,
             count(DISTINCT ic.id) AS cases,
             count(DISTINCT i.id) FILTER (WHERE i.archived_at IS NULL) AS implants,
             count(DISTINCT pe.id) FILTER (WHERE pe.archived_at IS NULL) AS prosthetics,
             count(DISTINCT f.id) AS followups
      FROM implant_cases ic
      JOIN patients p ON p.id = ic.patient_id
      LEFT JOIN implants i ON i.implant_case_id = ic.id
      LEFT JOIN prosthetic_events pe ON pe.implant_case_id = ic.id
      LEFT JOIN followups f ON f.implant_case_id = ic.id
      WHERE ${where}
      GROUP BY 1 ORDER BY cases DESC, name
    `),
    db.execute(sql`
      SELECT
        ic.base_treatment_amount
          + COALESCE((SELECT SUM(ch.amount) FROM case_charges ch
             WHERE ch.implant_case_id = ic.id
               AND ch.charge_date BETWEEN ${filters.from} AND ${filters.to}), 0)
          - COALESCE((SELECT SUM(cd.amount) FROM case_discounts cd
             WHERE cd.implant_case_id = ic.id
               AND cd.discount_date BETWEEN ${filters.from} AND ${filters.to}), 0) AS "treatmentValue",
        COALESCE((SELECT SUM(pay.amount) FROM payments pay
          WHERE pay.implant_case_id = ic.id AND pay.voided_at IS NULL), 0) AS collected,
        COALESCE((SELECT SUM(ch.amount) FROM case_charges ch
          WHERE ch.implant_case_id = ic.id
            AND ch.charge_date BETWEEN ${filters.from} AND ${filters.to}), 0) AS charges,
        COALESCE((SELECT SUM(cd.amount) FROM case_discounts cd
          WHERE cd.implant_case_id = ic.id
            AND cd.discount_date BETWEEN ${filters.from} AND ${filters.to}), 0) AS discounts,
        COALESCE((SELECT SUM(pay.amount) FROM payments pay
          WHERE pay.implant_case_id = ic.id
            AND pay.voided_at IS NULL
            AND pay.payment_date BETWEEN ${filters.from} AND ${filters.to}), 0) AS "periodCollected",
        (SELECT count(*) FROM payments pay
          WHERE pay.implant_case_id = ic.id
            AND pay.voided_at IS NULL
            AND pay.payment_date BETWEEN ${filters.from} AND ${filters.to}) AS payments
      FROM implant_cases ic
      JOIN patients p ON p.id = ic.patient_id
      WHERE ${where}
    `),
    db.execute(sql`
      SELECT COALESCE(NULLIF(btrim(pay.payment_method), ''), 'غير محدد') AS name,
             count(*) AS count
      FROM payments pay
      JOIN implant_cases ic ON ic.id = pay.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE pay.voided_at IS NULL AND pay.payment_date BETWEEN ${filters.from} AND ${filters.to}
        AND ${where}
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT CASE
               WHEN paid.total_paid = 0 THEN 'لم يدفع'
               WHEN paid.total_paid < obligation.final_total THEN 'مدفوع جزئيًا'
               WHEN paid.total_paid = obligation.final_total THEN 'مدفوع بالكامل'
               ELSE 'رصيد زائد'
             END AS name,
             count(*) AS count
      FROM (
        SELECT ic.id,
          (ic.base_treatment_amount
            + COALESCE((SELECT SUM(amount) FROM case_charges WHERE implant_case_id = ic.id), 0)
            - COALESCE((SELECT SUM(amount) FROM case_discounts WHERE implant_case_id = ic.id), 0)) AS final_total,
          COALESCE((SELECT SUM(amount) FROM payments
            WHERE implant_case_id = ic.id AND voided_at IS NULL), 0) AS total_paid
        FROM implant_cases ic JOIN patients p ON p.id = ic.patient_id
        WHERE ${where}
      ) paid
      CROSS JOIN LATERAL (SELECT paid.final_total) obligation
      GROUP BY 1 ORDER BY 2 DESC, 1
    `),
    db.execute(sql`
      SELECT ${grouping === "day"
        ? sql`pay.payment_date::text`
        : sql`LEFT(pay.payment_date::text, 7)`} AS bucket,
             COALESCE(SUM(pay.amount), 0) AS count
      FROM payments pay
      JOIN implant_cases ic ON ic.id = pay.implant_case_id
      JOIN patients p ON p.id = ic.patient_id
      WHERE pay.voided_at IS NULL
        AND pay.payment_date BETWEEN ${filters.from} AND ${filters.to}
        AND ${where}
      GROUP BY 1 ORDER BY 1
    `),
  ]);

  const overview = firstRow(overviewRows);
  const prosthetic = firstRow(prostheticSummaryRows);
  const boneGraft = firstRow(boneGraftSummaryRows);
  const followup = firstRow(followupSummaryRows);
  const communication = firstRow(communicationSummaryRows);
  const financialRows = financeSummaryRows.rows as Array<Record<string, unknown>>;
  const financialsTotal = financialRows.reduce<{
    treatmentValue: number;
    collected: number;
    charges: number;
    discounts: number;
    periodCollected: number;
    payments: number;
  }>(
    (total, row) => ({
      treatmentValue: total.treatmentValue + num(row.treatmentValue),
      collected: total.collected + num(row.collected),
      charges: total.charges + num(row.charges),
      discounts: total.discounts + num(row.discounts),
      periodCollected: total.periodCollected + num(row.periodCollected),
      payments: total.payments + num(row.payments),
    }),
    {
      treatmentValue: 0,
      collected: 0,
      charges: 0,
      discounts: 0,
      periodCollected: 0,
      payments: 0,
    },
  );

  const doctors = (doctorRows.rows as Array<Record<string, unknown>>).map((row) => ({
    name: String(row.name),
    patients: num(row.patients),
    cases: num(row.cases),
    implants: num(row.implants),
    prosthetics: num(row.prosthetics),
    followups: num(row.followups),
  }));

  const hub: StatisticsHub = {
    overview: {
      patients: num(overview.patients),
      implantedPatients: num(overview.implantedPatients),
      cases: num(overview.cases),
      implants: num(overview.implants),
      boneGraftProcedures: num(overview.boneGraftProcedures),
      systems: num(overview.systems),
      prostheticPatients: num(overview.prostheticPatients),
      prostheticEvents: num(overview.prostheticEvents),
      followups: num(overview.followups),
      overdueFollowups: num(overview.overdueFollowups),
      failedImplants: num(overview.failedImplants),
      needsRedoImplants: num(overview.needsRedoImplants),
    },
    patients: {
      newPatients: num((patientTrendRows.rows as Array<Record<string, unknown>>).reduce((sum, row) => sum + num(row.count), 0)),
      implantedPatients: num(overview.implantedPatients),
      casePatients: num(overview.patients),
      prostheticPatients: num(overview.prostheticPatients),
      overTime: toMetricBuckets(patientTrendRows),
    },
    prosthetics: {
      patients: num(prosthetic.patients),
      events: num(prosthetic.events),
      temporary: num(prosthetic.temporary),
      permanent: num(prosthetic.permanent),
      readyCases: num(firstRow(readyCaseRows).count),
      overTime: toMetricBuckets(prostheticTrendRows),
      byDoctor: toCounts(prostheticDoctorRows),
    },
    boneGraftProcedures: {
      total: num(boneGraft.total),
      patients: num(boneGraft.patients),
      cases: num(boneGraft.cases),
      overTime: toMetricBuckets(boneGraftTrendRows),
      types: toCounts(boneGraftTypeRows),
      materials: toCounts(boneGraftMaterialRows),
      statuses: toCounts(boneGraftStatusRows),
    },
    followups: {
      total: num(followup.total),
      scheduled: num(followup.scheduled),
      dueToday: num(followup.dueToday),
      overdue: num(followup.overdue),
      completed: num(followup.completed),
      cancelled: num(followup.cancelled),
      needsRecontact: num(followup.needsRecontact),
      overTime: toMetricBuckets(followupTrendRows),
      types: toCounts(followupTypesRows),
      outcomes: toCounts(followupOutcomesRows),
      byAssignee: toCounts(followupAssigneesRows),
    },
    communications: {
      total: num(communication.total),
      withResults: num(communication.withResults),
      overTime: toMetricBuckets(communicationTrendRows),
      results: toCounts(communicationResultsRows),
      reasons: toCounts(communicationReasonsRows),
    },
    financials: includeFinancials
      ? {
          treatmentValue: financialsTotal.treatmentValue,
          collected: financialsTotal.periodCollected,
          remaining: Math.max(0, financialsTotal.treatmentValue - financialsTotal.collected),
          charges: financialsTotal.charges,
          discounts: financialsTotal.discounts,
          payments: financialsTotal.payments,
          outstandingPatients: 0,
          paymentMethods: toCounts(paymentMethodsRows),
          paymentStatuses: toCounts(paymentStatusesRows),
          collectionsOverTime: toMetricBuckets(collectionTrendRows),
        }
      : null,
    doctors,
  };

  return hub;
}

/* ------------------------------------------------------------------ */
/* GET /statistics — filtered clinical statistics                      */
/* ------------------------------------------------------------------ */

async function buildStatisticsReport(
  filters: ReportFilters,
  includeFinance: boolean,
  tenantId: string,
): Promise<StatisticsResponse> {
  const grouping = rangeGrouping(filters);
  const where = caseFilterFragment(filters, tenantId);
  const bucketExpr =
    grouping === "day"
      ? sql`COALESCE(ic.procedure_date::text, (ic.created_at AT TIME ZONE 'Asia/Riyadh')::date::text)`
      : sql`LEFT(COALESCE(ic.procedure_date::text, (ic.created_at AT TIME ZONE 'Asia/Riyadh')::date::text), 7)`;
  const outcomes = FOLLOWUP_OUTCOME_STATUSES as readonly string[];

  const [caseBuckets, implantBuckets, systems, caseStatuses, implantStatuses, boneGraftProcedureTypes, boneGraftProcedureStatuses, outcomeRows, reimplantRows, doctorRows, hub] =
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
        SELECT bgp.procedure_category AS name, count(*) AS count
        FROM bone_graft_procedures bgp
        JOIN implant_cases ic ON ic.id = bgp.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE bgp.archived_at IS NULL AND ${where}
          AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
        GROUP BY 1 ORDER BY 2 DESC, 1
      `),
      db.execute(sql`
        SELECT bgp.procedure_status AS name, count(*) AS count
        FROM bone_graft_procedures bgp
        JOIN implant_cases ic ON ic.id = bgp.implant_case_id
        JOIN patients p ON p.id = ic.patient_id
        WHERE bgp.archived_at IS NULL AND ${where}
          AND bgp.procedure_date BETWEEN ${filters.from} AND ${filters.to}
        GROUP BY 1 ORDER BY 2 DESC, 1
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
          AND ic.tenant_id = ${tenantId}
        ORDER BY 1
      `),
      buildStatisticsHub(filters, where, grouping, includeFinance, tenantId),
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

  return {
    overTime: [...bucketMap.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([bucket, v]) => ({ bucket, ...v })),
    overTimeGrouping: grouping,
    implantSystems: toCounts(systems),
    caseStatuses: toCounts(caseStatuses),
    implantStatuses: implantStatusCounts,
    boneGraftProcedureTypes: toCounts(boneGraftProcedureTypes),
    boneGraftProcedureStatuses: toCounts(boneGraftProcedureStatuses),
    followupOutcomes: toCounts(outcomeRows),
    failedImplants: findCount(FAILED_IMPLANT_STATUS),
    needsRedoImplants: findCount(REDO_IMPLANT_STATUS),
    reimplantationCases: num(
      (reimplantRows.rows[0] as { count: unknown }).count,
    ),
    doctorOptions: (doctorRows.rows as Array<{ name: string }>).map(
      (r) => r.name,
    ),
    hub,
  };
}

router.get("/statistics", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const response = await buildStatisticsReport(
    filters,
    financeViewAllowed(req),
    req.currentTenant!.id,
  );
  res.json(response);
});

type ExportLocale = Exclude<ReportLocale, "mixed">;

function exportLocale(req: { query: unknown }, res: {
  status: (code: number) => { json: (body: unknown) => unknown };
}): ExportLocale | undefined {
  const value = (req.query as Record<string, unknown>).locale;
  if (value === undefined) return "ar";
  if (typeof value !== "string" || (value !== "ar" && value !== "en")) {
    res.status(400).json({ message: "locale must be ar or en" });
    return undefined;
  }
  return value;
}

const exportLabels = {
  ar: {
    statistics: "التقرير الإحصائي",
    operational: "التقرير التشغيلي",
    overview: "الملخص العام",
    overTime: "الاتجاه الزمني",
    implantSystems: "أنظمة الزرعات",
    caseStatuses: "حالات الحالات",
    implantStatuses: "حالات الزرعات",
    graftTypes: "أنواع إجراءات زراعة العظم",
    graftStatuses: "حالات إجراءات زراعة العظم",
    followupOutcomes: "نتائج المتابعة",
    financials: "البيانات المالية",
    doctors: "مؤشرات الأطباء",
    metric: "المؤشر",
    value: "القيمة",
    bucket: "الفترة",
    cases: "الحالات",
    implants: "الزرعات",
    name: "الاسم",
    count: "العدد",
    patients: "المرضى",
    implantedPatients: "المرضى ذوو الزرعات",
    boneGraftProcedures: "إجراءات زراعة العظم",
    systems: "الأنظمة",
    prostheticPatients: "مرضى التركيبات",
    prostheticEvents: "أحداث التركيبات",
    followups: "المتابعات",
    overdueFollowups: "المتابعات المتأخرة",
    failedImplants: "الزرعات الفاشلة",
    needsRedoImplants: "زرعات تحتاج إعادة",
    treatmentValue: "قيمة العلاج",
    collected: "المحصل",
    remaining: "المتبقي",
    charges: "الرسوم",
    discounts: "الخصومات",
    payments: "الدفعات",
    treatingDoctor: "الطبيب المعالج",
    patient: "المريض",
    fileNumber: "رقم الملف",
    caseStatus: "حالة الحالة",
    procedureDate: "تاريخ العملية",
    implantCount: "عدد الزرعات",
    boneGraftProcedureCount: "عدد إجراءات زراعة العظم",
    boneGraftProcedureTypes: "أنواع إجراءات زراعة العظم",
    adjunctProcedures: "الإجراءات الإضافية",
    nextFollowup: "المتابعة القادمة",
    overdue: "متأخرة",
    ready: "جاهزة للتركيب",
    finalTotal: "الإجمالي النهائي",
    paid: "المدفوع",
    paymentStatus: "حالة السداد",
    from: "من",
    to: "إلى",
    search: "بحث",
    doctor: "الطبيب",
    system: "النظام",
    implantStatus: "حالة الزرعة",
  },
  en: {
    statistics: "Statistics report",
    operational: "Operational report",
    overview: "Overview",
    overTime: "Time series",
    implantSystems: "Implant systems",
    caseStatuses: "Case statuses",
    implantStatuses: "Implant statuses",
    graftTypes: "Bone graft procedure types",
    graftStatuses: "Bone graft procedure statuses",
    followupOutcomes: "Follow-up outcomes",
    financials: "Financials",
    doctors: "Doctor metrics",
    metric: "Metric",
    value: "Value",
    bucket: "Period",
    cases: "Cases",
    implants: "Implants",
    name: "Name",
    count: "Count",
    patients: "Patients",
    implantedPatients: "Patients with implants",
    boneGraftProcedures: "Bone graft procedures",
    systems: "Systems",
    prostheticPatients: "Prosthetic patients",
    prostheticEvents: "Prosthetic events",
    followups: "Follow-ups",
    overdueFollowups: "Overdue follow-ups",
    failedImplants: "Failed implants",
    needsRedoImplants: "Implants needing redo",
    treatmentValue: "Treatment value",
    collected: "Collected",
    remaining: "Remaining",
    charges: "Charges",
    discounts: "Discounts",
    payments: "Payments",
    treatingDoctor: "Treating doctor",
    patient: "Patient",
    fileNumber: "File number",
    caseStatus: "Case status",
    procedureDate: "Procedure date",
    implantCount: "Implant count",
    boneGraftProcedureCount: "Bone graft procedure count",
    boneGraftProcedureTypes: "Bone graft procedure types",
    adjunctProcedures: "Adjunct procedures",
    nextFollowup: "Next follow-up",
    overdue: "Overdue",
    ready: "Ready",
    finalTotal: "Final total",
    paid: "Paid",
    paymentStatus: "Payment status",
    from: "From",
    to: "To",
    search: "Search",
    doctor: "Doctor",
    system: "System",
    implantStatus: "Implant status",
  },
} as const;

function filterMetadata(filters: ReportFilters, locale: ExportLocale) {
  const labels = exportLabels[locale];
  return {
    [`${labels.from} / ${labels.to}`]: `${filters.from} – ${filters.to}`,
    ...(filters.search ? { [labels.search]: filters.search } : {}),
    ...(filters.treatingDoctor ? { [labels.doctor]: filters.treatingDoctor } : {}),
    ...(filters.implantSystem ? { [labels.system]: filters.implantSystem } : {}),
    ...(filters.implantStatus ? { [labels.implantStatus]: filters.implantStatus } : {}),
    ...(filters.caseStatus ? { [labels.caseStatus]: filters.caseStatus } : {}),
  };
}

function countSection(
  title: string,
  counts: Array<{ name: string; count: number }>,
  labels: (typeof exportLabels)[ExportLocale],
): { title: string; columns: ReportColumn[]; rows: ReportRow[] } {
  return {
    title,
    columns: [
      { key: "name", header: labels.name, type: "text" },
      { key: "count", header: labels.count, type: "number", align: "right" },
    ],
    rows: counts.map((item) => ({ name: item.name, count: item.count })),
  };
}

function statisticsDefinition(
  report: StatisticsResponse,
  filters: ReportFilters,
  locale: ExportLocale,
  clinicName: string,
): ReportDefinition {
  const labels = exportLabels[locale];
  const overview = report.hub.overview;
  const overviewLabels: Array<[keyof typeof overview, string]> = [
    ["patients", labels.patients],
    ["implantedPatients", labels.implantedPatients],
    ["cases", labels.cases],
    ["implants", labels.implants],
    ["boneGraftProcedures", labels.boneGraftProcedures],
    ["systems", labels.systems],
    ["prostheticPatients", labels.prostheticPatients],
    ["prostheticEvents", labels.prostheticEvents],
    ["followups", labels.followups],
    ["overdueFollowups", labels.overdueFollowups],
    ["failedImplants", labels.failedImplants],
    ["needsRedoImplants", labels.needsRedoImplants],
  ];
  const sections: NonNullable<ReportDefinition["sections"]> = [
    {
      title: labels.overview,
      columns: [
        { key: "metric", header: labels.metric, type: "text" },
        { key: "value", header: labels.value, type: "number", align: "right" },
      ],
      rows: overviewLabels.map(([key, name]) => ({ metric: name, value: overview[key] })),
    },
    {
      title: labels.overTime,
      columns: [
        { key: "bucket", header: labels.bucket, type: "text" },
        { key: "cases", header: labels.cases, type: "number", align: "right" },
        { key: "implants", header: labels.implants, type: "number", align: "right" },
      ],
      rows: report.overTime,
    },
    countSection(labels.implantSystems, report.implantSystems, labels),
    countSection(labels.caseStatuses, report.caseStatuses, labels),
    countSection(labels.implantStatuses, report.implantStatuses, labels),
    countSection(labels.graftTypes, report.boneGraftProcedureTypes, labels),
    countSection(labels.graftStatuses, report.boneGraftProcedureStatuses, labels),
    countSection(labels.followupOutcomes, report.followupOutcomes, labels),
    {
      title: labels.doctors,
      columns: [
        { key: "name", header: labels.treatingDoctor, type: "text" },
        { key: "patients", header: labels.patients, type: "number" },
        { key: "cases", header: labels.cases, type: "number" },
        { key: "implants", header: labels.implants, type: "number" },
        { key: "prosthetics", header: labels.prostheticEvents, type: "number" },
        { key: "followups", header: labels.followups, type: "number" },
      ],
      rows: report.hub.doctors,
    },
  ];
  if (report.hub.financials) {
    const finance = report.hub.financials;
    sections.push({
      title: labels.financials,
      columns: [
        { key: "metric", header: labels.metric, type: "text" },
        { key: "value", header: labels.value, type: "currency", align: "right" },
      ],
      rows: [
        { metric: labels.treatmentValue, value: finance.treatmentValue },
        { metric: labels.collected, value: finance.collected },
        { metric: labels.remaining, value: finance.remaining },
        { metric: labels.charges, value: finance.charges },
        { metric: labels.discounts, value: finance.discounts },
      ],
    });
    sections.push({
      title: `${labels.financials} — ${labels.payments}`,
      columns: [
        { key: "metric", header: labels.metric, type: "text" },
        { key: "value", header: labels.value, type: "number", align: "right" },
      ],
      rows: [{ metric: labels.payments, value: finance.payments }],
    });
  }
  return {
    metadata: {
      title: labels.statistics,
      subtitle: `${filters.from} – ${filters.to}`,
      clinicName,
      generatedAt: new Date(),
      filters: filterMetadata(filters, locale),
      filename: `statistics-report-${filters.from}-${filters.to}`,
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      orientation: "landscape",
    },
    sections,
  };
}

function operationalDefinition(
  rows: OperationalRow[],
  filters: ReportFilters,
  includeFinance: boolean,
  locale: ExportLocale,
  clinicName: string,
): ReportDefinition {
  const labels = exportLabels[locale];
  const dateValue = (value: string | null): Date | null =>
    value ? new Date(`${value.slice(0, 10)}T12:00:00+03:00`) : null;
  const columns: ReportColumn[] = [
    { key: "patientName", header: labels.patient, type: "text" },
    { key: "fileNumber", header: labels.fileNumber, type: "text" },
    { key: "caseStatus", header: labels.caseStatus, type: "text" },
    { key: "treatingDoctor", header: labels.treatingDoctor, type: "text" },
    { key: "procedureDate", header: labels.procedureDate, type: "date" },
    { key: "implantCount", header: labels.implantCount, type: "number" },
    { key: "implantSystems", header: labels.implantSystems, type: "text" },
    { key: "implantStatuses", header: labels.implantStatuses, type: "text" },
    { key: "boneGraftProcedureCount", header: labels.boneGraftProcedureCount, type: "number" },
    { key: "boneGraftProcedureTypes", header: labels.boneGraftProcedureTypes, type: "text" },
    { key: "adjunctProcedures", header: labels.adjunctProcedures, type: "text" },
    { key: "nextFollowup", header: labels.nextFollowup, type: "date" },
    { key: "isOverdue", header: labels.overdue, type: "boolean" },
    { key: "isReady", header: labels.ready, type: "boolean" },
  ];
  if (includeFinance) {
    columns.push(
      { key: "finalTotal", header: labels.finalTotal, type: "currency" },
      { key: "paid", header: labels.paid, type: "currency" },
      { key: "remaining", header: labels.remaining, type: "currency" },
      { key: "paymentStatus", header: labels.paymentStatus, type: "text" },
    );
  }
  return {
    metadata: {
      title: labels.operational,
      subtitle: `${filters.from} – ${filters.to}`,
      clinicName,
      generatedAt: new Date(),
      filters: filterMetadata(filters, locale),
      filename: `operational-report-${filters.from}-${filters.to}`,
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      orientation: "landscape",
    },
    columns,
    rows: rows.map((row) => ({
      patientName: row.patientName,
      fileNumber: row.fileNumber,
      caseStatus: row.caseStatus,
      treatingDoctor: row.treatingDoctor,
      procedureDate: dateValue(row.procedureDate),
      implantCount: row.implantCount,
      implantSystems: row.implantSystems.join("، "),
      implantStatuses: row.implantStatuses.join("، "),
      boneGraftProcedureCount: row.boneGraftProcedureCount,
      boneGraftProcedureTypes: row.boneGraftProcedureTypes.join("، "),
      adjunctProcedures: row.adjunctProcedureTypes.join("، "),
      nextFollowup: dateValue(row.nextFollowupAt),
      isOverdue: row.isOverdue,
      isReady: row.isReady,
      ...(includeFinance && row.finance
        ? {
            finalTotal: row.finance.finalTotal,
            paid: row.finance.paid,
            remaining: row.finance.remaining,
            paymentStatus: row.finance.paymentStatus,
          }
        : {}),
    })),
  };
}

function exportRowCount(report: ReportDefinition): number {
  return (report.sections ?? [{ rows: report.rows ?? [], columns: report.columns ?? [] }])
    .reduce((count, section) => count + section.rows.length, 0);
}

async function sendReportExport(
  req: {
    query: unknown;
    currentTenant?: { id: string };
    currentUser?: { id: string };
  },
  res: {
    setHeader: (name: string, value: string) => unknown;
    send: (body: Buffer) => unknown;
  },
  format: "pdf" | "xlsx",
  filters: ReportFilters,
  report: ReportDefinition,
  includeFinance: boolean,
): Promise<void> {
  const rendered = format === "pdf"
    ? await renderPdf(report)
    : await renderXlsx(report);
  await auditExport(req, format, filters, exportRowCount(report), includeFinance);
  res.setHeader("Content-Type", rendered.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${rendered.filename}"`);
  res.send(rendered.data);
}

router.get("/statistics/export.pdf", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const locale = exportLocale(req, res);
  if (!locale) return;
  const includeFinance = financeViewAllowed(req);
  const data = await buildStatisticsReport(filters, includeFinance, req.currentTenant!.id);
  await sendReportExport(
    req,
    res,
    "pdf",
    filters,
    statisticsDefinition(data, filters, locale, req.currentTenant!.name),
    includeFinance,
  );
});

router.get("/statistics/export.xlsx", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const locale = exportLocale(req, res);
  if (!locale) return;
  const includeFinance = financeViewAllowed(req);
  const data = await buildStatisticsReport(filters, includeFinance, req.currentTenant!.id);
  await sendReportExport(
    req,
    res,
    "xlsx",
    filters,
    statisticsDefinition(data, filters, locale, req.currentTenant!.name),
    includeFinance,
  );
});

async function auditExport(
  req: { currentTenant?: { id: string }; currentUser?: { id: string } },
  format: "pdf" | "xlsx" | "csv",
  filters: ReportFilters,
  rowCount: number,
  includeFinance: boolean,
  summary = `تصدير التقرير (${format}) (${filters.from} إلى ${filters.to}) — ${rowCount} صف`,
): Promise<void> {
  await writeAudit({
    tenantId: req.currentTenant!.id,
    userId: req.currentUser?.id,
    action: "report_export",
    entityType: "report",
    summary,
    details: { format, filters, rowCount, includeFinance },
  });
}

/* ------------------------------------------------------------------ */
/* Operational report (rows + CSV export)                              */
/* ------------------------------------------------------------------ */

async function buildOperationalRows(
  filters: ReportFilters,
  includeFinance: boolean,
  tenantId: string,
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
      (SELECT COALESCE(array_agg(i.implant_status ORDER BY i.implant_status), '{}')
        FROM implants i
        JOIN implant_cases active_ic ON active_ic.id = i.implant_case_id
        JOIN patients active_p ON active_p.id = active_ic.patient_id
        WHERE active_ic.patient_id = ic.patient_id
          AND i.archived_at IS NULL
          AND active_ic.archived_at IS NULL
          AND active_p.archived_at IS NULL) AS "implantStatuses",
      (SELECT count(*) FROM bone_graft_procedures bgp
        WHERE bgp.implant_case_id = ic.id
          AND bgp.archived_at IS NULL) AS "boneGraftProcedureCount",
      (SELECT COALESCE(array_agg(DISTINCT bgp.procedure_category), '{}')
        FROM bone_graft_procedures bgp
        WHERE bgp.implant_case_id = ic.id
          AND bgp.archived_at IS NULL) AS "boneGraftProcedureTypes",
       (SELECT COALESCE(array_agg(bgp.procedure_category ORDER BY bgp.created_at, bgp.id), '{}')
        FROM bone_graft_procedures bgp
        JOIN implant_cases active_adjunct_ic ON active_adjunct_ic.id = bgp.implant_case_id
        JOIN patients active_adjunct_p ON active_adjunct_p.id = active_adjunct_ic.patient_id
        WHERE active_adjunct_ic.patient_id = ic.patient_id
          AND active_adjunct_ic.archived_at IS NULL
          AND active_adjunct_p.archived_at IS NULL
          AND bgp.archived_at IS NULL) AS "adjunctProcedureTypes",
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
    WHERE ${caseFilterFragment(filters, tenantId)}
    ORDER BY ic.created_at DESC, p.full_name ASC
  `);

  const financeByCase = new Map<
    string,
    { finalCents: number; paidCents: number; status: string }
  >();
  if (includeFinance) {
    const rowsCaseIds = new Set(
      (rows.rows as Array<Record<string, unknown>>).map((row) => String(row.caseId)),
    );
    for (const c of await loadCaseFinancials({}, tenantId)) {
      if (rowsCaseIds.has(c.id)) financeByCase.set(c.id, c);
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
      implantStatuses: (r.implantStatuses as string[] | null) ?? [],
      boneGraftProcedureCount: num(r.boneGraftProcedureCount),
      boneGraftProcedureTypes: (r.boneGraftProcedureTypes as string[] | null) ?? [],
      adjunctProcedureTypes: (r.adjunctProcedureTypes as string[] | null) ?? [],
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
  const rows = await buildOperationalRows(filters, includeFinance, req.currentTenant!.id);
  const response: OperationalReportResponse = {
    rows,
    financialsIncluded: includeFinance,
  };
  res.json(response);
});

router.get("/reports/operational/export.pdf", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const locale = exportLocale(req, res);
  if (!locale) return;
  const includeFinance = financeViewAllowed(req);
  const rows = await buildOperationalRows(filters, includeFinance, req.currentTenant!.id);
  await sendReportExport(
    req,
    res,
    "pdf",
    filters,
    operationalDefinition(
      rows,
      filters,
      includeFinance,
      locale,
      req.currentTenant!.name,
    ),
    includeFinance,
  );
});

router.get("/reports/operational/export.xlsx", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const locale = exportLocale(req, res);
  if (!locale) return;
  const includeFinance = financeViewAllowed(req);
  const rows = await buildOperationalRows(filters, includeFinance, req.currentTenant!.id);
  await sendReportExport(
    req,
    res,
    "xlsx",
    filters,
    operationalDefinition(
      rows,
      filters,
      includeFinance,
      locale,
      req.currentTenant!.name,
    ),
    includeFinance,
  );
});

const csvEscape = (value: string): string =>
  /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;

router.get("/reports/operational/export.csv", async (req, res) => {
  const filters = parseOrRespond(reportFiltersSchema, req.query, res);
  if (!filters) return;
  const includeFinance = financeViewAllowed(req);
  const rows = await buildOperationalRows(filters, includeFinance, req.currentTenant!.id);

  const headers = [
    "المريض",
    "رقم الملف",
    "حالة الحالة",
    "الطبيب المعالج",
    "تاريخ العملية",
    "عدد الزرعات",
    "أنظمة الزرعات",
    "إجراءات زراعة العظم",
    "أنواع إجراءات زراعة العظم",
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
      String(r.boneGraftProcedureCount),
      r.boneGraftProcedureTypes.join("، "),
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

  await auditExport(
    req,
    "csv",
    filters,
    rows.length,
    includeFinance,
    `تصدير التقرير التشغيلي (${filters.from} إلى ${filters.to}) — ${rows.length} صف`,
  );

  res
    .setHeader("Content-Type", "text/csv; charset=utf-8")
    .setHeader(
      "Content-Disposition",
      `attachment; filename="operational-report-${filters.from}-${filters.to}.csv"`,
    )
    .send(csv);
});

export default router;
