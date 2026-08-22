import { z } from "zod";
import { caseStatusSchema } from "./implants";

/* ------------------------------------------------------------------ */
/* Phase 5 — dashboard, statistics, and operational report contracts   */
/* ------------------------------------------------------------------ */

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة.");

/**
 * Filters for statistics and the operational report. The client resolves
 * period presets (اليوم، هذا الأسبوع، هذا الشهر، الشهر الماضي، هذه السنة،
 * فترة مخصصة) into an inclusive Riyadh-calendar date range.
 */
export const reportFiltersSchema = z
  .object({
    from: isoDateSchema,
    to: isoDateSchema,
    search: z.string().trim().min(1).max(200).optional(),
    treatingDoctor: z.string().trim().min(1).max(200).optional(),
    implantSystem: z.string().trim().min(1).max(200).optional(),
    implantStatus: z.string().trim().min(1).max(100).optional(),
    caseStatus: caseStatusSchema.optional(),
  })
  .refine((v) => v.from <= v.to, {
    message: "بداية الفترة يجب أن تكون قبل نهايتها.",
    path: ["to"],
  });
export type ReportFilters = z.infer<typeof reportFiltersSchema>;

/* ----------------------------- Dashboard -------------------------- */

/** Operational KPI counters, all computed live from non-archived records. */
export const dashboardKpisSchema = z.object({
  activePatients: z.number().int(),
  activeCases: z.number().int(),
  activeImplants: z.number().int(),
  todayAppointments: z.number().int(),
  overdueFollowups: z.number().int(),
  readyCases: z.number().int(),
  failedOrRedoImplants: z.number().int(),
  contactTasksDue: z.number().int(),
});
export type DashboardKpis = z.infer<typeof dashboardKpisSchema>;

const workSummaryPeriodSchema = z.object({
  implantedPatients: z.number().int(),
  implants: z.number().int(),
  implantSystems: z.object({
    count: z.number().int(),
    names: z.array(z.string()),
  }),
  prostheticPatients: z.number().int(),
  completedProsthetics: z.number().int(),
});
export type WorkSummaryPeriod = z.infer<typeof workSummaryPeriodSchema>;

/**
 * Clinical work completed today and month-to-date in Riyadh calendar time.
 * Implant work is anchored to the case procedure date; prosthetic work is
 * anchored to explicit, dated prosthetic event records.
 */
export const workSummarySchema = z.object({
  today: workSummaryPeriodSchema,
  month: workSummaryPeriodSchema,
});
export type WorkSummary = z.infer<typeof workSummarySchema>;

/** Present only for users with financial-view permission. */
export const dashboardFinancialsSchema = z.object({
  collectedThisMonth: z.number(),
  totalOutstanding: z.number(),
});
export type DashboardFinancials = z.infer<typeof dashboardFinancialsSchema>;

/** Compact row for the actionable dashboard lists. */
export const dashboardListItemSchema = z.object({
  patientId: z.string(),
  patientName: z.string(),
  fileNumber: z.string(),
  /** Follow-up type or case status, depending on the list. */
  title: z.string(),
  /** ISO timestamp or date for display (nullable for ready cases). */
  at: z.string().nullable(),
  assignedUserName: z.string().nullable(),
});
export type DashboardListItem = z.infer<typeof dashboardListItemSchema>;

export const dashboardActivitySchema = z.object({
  action: z.string(),
  summary: z.string().nullable(),
  userName: z.string().nullable(),
  createdAt: z.string(),
});
export type DashboardActivity = z.infer<typeof dashboardActivitySchema>;

export const dashboardResponseSchema = z.object({
  kpis: dashboardKpisSchema,
  workSummary: workSummarySchema,
  /** null when the current user lacks financial-view permission. */
  financials: dashboardFinancialsSchema.nullable(),
  todayAppointments: z.array(dashboardListItemSchema),
  overdueFollowups: z.array(dashboardListItemSchema),
  readyCases: z.array(dashboardListItemSchema),
  contactTasks: z.array(dashboardListItemSchema),
  recentActivities: z.array(dashboardActivitySchema),
});
export type DashboardResponse = z.infer<typeof dashboardResponseSchema>;

/* ----------------------------- Statistics ------------------------- */

export const statBucketSchema = z.object({
  bucket: z.string(),
  cases: z.number().int(),
  implants: z.number().int(),
});
export const statCountSchema = z.object({
  name: z.string(),
  count: z.number().int(),
});
export type StatCount = z.infer<typeof statCountSchema>;

const metricBucketSchema = z.object({
  bucket: z.string(),
  count: z.number(),
});
const doctorMetricSchema = z.object({
  name: z.string(),
  patients: z.number().int(),
  cases: z.number().int(),
  implants: z.number().int(),
  prosthetics: z.number().int(),
  followups: z.number().int(),
});

export const statisticsHubSchema = z.object({
  overview: z.object({
    patients: z.number().int(),
    implantedPatients: z.number().int(),
    cases: z.number().int(),
    implants: z.number().int(),
    boneGraftProcedures: z.number().int(),
    systems: z.number().int(),
    prostheticPatients: z.number().int(),
    prostheticEvents: z.number().int(),
    followups: z.number().int(),
    overdueFollowups: z.number().int(),
    failedImplants: z.number().int(),
    needsRedoImplants: z.number().int(),
  }),
  patients: z.object({
    newPatients: z.number().int(),
    implantedPatients: z.number().int(),
    casePatients: z.number().int(),
    prostheticPatients: z.number().int(),
    overTime: z.array(metricBucketSchema),
  }),
  prosthetics: z.object({
    patients: z.number().int(),
    events: z.number().int(),
    temporary: z.number().int(),
    permanent: z.number().int(),
    readyCases: z.number().int(),
    overTime: z.array(metricBucketSchema),
    byDoctor: z.array(statCountSchema),
  }),
  boneGraftProcedures: z.object({
    total: z.number().int(),
    patients: z.number().int(),
    cases: z.number().int(),
    overTime: z.array(metricBucketSchema),
    types: z.array(statCountSchema),
    materials: z.array(statCountSchema),
    statuses: z.array(statCountSchema),
  }),
  followups: z.object({
    total: z.number().int(),
    scheduled: z.number().int(),
    dueToday: z.number().int(),
    overdue: z.number().int(),
    completed: z.number().int(),
    cancelled: z.number().int(),
    needsRecontact: z.number().int(),
    overTime: z.array(metricBucketSchema),
    types: z.array(statCountSchema),
    outcomes: z.array(statCountSchema),
    byAssignee: z.array(statCountSchema),
  }),
  communications: z.object({
    total: z.number().int(),
    withResults: z.number().int(),
    overTime: z.array(metricBucketSchema),
    results: z.array(statCountSchema),
    reasons: z.array(statCountSchema),
  }),
  financials: z
    .object({
      treatmentValue: z.number(),
      collected: z.number(),
      remaining: z.number(),
      charges: z.number(),
      discounts: z.number(),
      payments: z.number().int(),
      outstandingPatients: z.number().int(),
      paymentMethods: z.array(statCountSchema),
      paymentStatuses: z.array(statCountSchema),
      collectionsOverTime: z.array(metricBucketSchema),
    })
    .nullable(),
  doctors: z.array(doctorMetricSchema),
});
export type StatisticsHub = z.infer<typeof statisticsHubSchema>;

export const statisticsResponseSchema = z.object({
  overTime: z.array(statBucketSchema),
  overTimeGrouping: z.enum(["day", "month"]),
  implantSystems: z.array(statCountSchema),
  caseStatuses: z.array(statCountSchema),
  implantStatuses: z.array(statCountSchema),
  boneGraftProcedureTypes: z.array(statCountSchema),
  boneGraftProcedureStatuses: z.array(statCountSchema),
  followupOutcomes: z.array(statCountSchema),
  failedImplants: z.number().int(),
  needsRedoImplants: z.number().int(),
  reimplantationCases: z.number().int(),
  doctorOptions: z.array(z.string()),
  hub: statisticsHubSchema,
});
export type StatisticsResponse = z.infer<typeof statisticsResponseSchema>;

/* ------------------------- Operational report --------------------- */

export const operationalRowFinanceSchema = z.object({
  finalTotal: z.number(),
  paid: z.number(),
  remaining: z.number(),
  paymentStatus: z.string(),
});

export const operationalRowSchema = z.object({
  caseId: z.string(),
  patientId: z.string(),
  patientName: z.string(),
  fileNumber: z.string(),
  caseStatus: z.string(),
  treatingDoctor: z.string(),
  procedureDate: z.string().nullable(),
  implantCount: z.number().int(),
  implantSystems: z.array(z.string()),
  implantStatuses: z.array(z.string()),
  boneGraftProcedureCount: z.number().int(),
  boneGraftProcedureTypes: z.array(z.string()),
  nextFollowupAt: z.string().nullable(),
  isOverdue: z.boolean(),
  isReady: z.boolean(),
  /** Present only when the user has financial-view permission. */
  finance: operationalRowFinanceSchema.nullable(),
});
export type OperationalRow = z.infer<typeof operationalRowSchema>;

export const operationalReportResponseSchema = z.object({
  rows: z.array(operationalRowSchema),
  /** Whether financial columns are included for this user. */
  financialsIncluded: z.boolean(),
});
export type OperationalReportResponse = z.infer<
  typeof operationalReportResponseSchema
>;
