import { Router, type IRouter, type Request, type Response } from "express";
import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNull,
} from "drizzle-orm";
import {
  boneGraftProceduresTable,
  caseChargesTable,
  caseDiscountsTable,
  communicationsTable,
  db,
  followupsTable,
  implantCasesTable,
  implantsTable,
  installmentPlansTable,
  installmentsTable,
  patientsTable,
  paymentsTable,
  prostheticEventsTable,
} from "@workspace/db";
import {
  formatRiyadhTimestamp,
  renderPdf,
  renderXlsx,
  type ReportColumn,
  type ReportDefinition,
  type ReportLocale,
  type ReportRow,
  type ReportSection,
} from "../lib/export";
import { effectivePermissions } from "../lib/permissions";
import { writeAudit } from "../lib/audit";
import { localizeExportList, localizeExportValue } from "../lib/export-localization";
import { normalizeSystemDigits } from "../lib/export/formatting";
import {
  buildInstallmentPlanDto,
  buildSummary,
  loadCaseFinancials,
} from "./finance";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();
router.use("/patients", requireAuth);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = { error: "المريض غير موجود.", code: "PATIENT_NOT_FOUND" };
type ExportFormat = "pdf" | "xlsx";
type ExportLocale = Exclude<ReportLocale, "mixed">;

const LABELS = {
  ar: {
    title: "السجل الطبي للمريض",
    subtitle: "تصدير مهني لملف المريض",
    patientInfo: "بيانات المريض",
    cases: "حالات الزراعة",
    implants: "الزرعات",
    adjuncts: "إجراءات زراعة العظم والجيوب والإجراءات المساعدة",
    prosthetics: "السجل التعويضي",
    followups: "المتابعات",
    communications: "التواصل",
    finance: "الملخص المالي",
    payments: "الدفعات",
    installments: "الأقساط",
    field: "البيان",
    value: "القيمة",
    case: "الحالة",
    name: "اسم المريض",
    fileNumber: "رقم الملف",
    mobile: "الجوال",
    age: "العمر",
    status: "الحالة",
    createdAt: "تاريخ إنشاء الملف",
    procedureDate: "تاريخ العملية",
    doctor: "الطبيب المعالج",
    referringDoctor: "الطبيب المحيل",
    caseStatus: "حالة الزراعة",
    prostheticValue: "خطة التركيب",
    expectedProstheticDate: "موعد التركيب المتوقع",
    reimplantation: "إعادة زراعة",
    note: "ملاحظة",
    site: "الموضع",
    system: "النظام",
    diameter: "القطر",
    length: "الطول",
    qValue: "Q",
    formerValue: "Former",
    graftValue: "العظم",
    procedureTags: "الإجراءات",
    implantStatus: "حالة الزرعة",
    date: "التاريخ",
    category: "التصنيف",
    type: "النوع",
    side: "الجهة",
    liftType: "نوع الرفع",
    material: "المادة",
    membrane: "الغشاء",
    quantity: "الكمية",
    size: "المقاس",
    procedureStatus: "حالة الإجراء",
    eventType: "نوع التركيب",
    result: "النتيجة",
    scheduledAt: "الموعد",
    nextAppointment: "الموعد التالي",
    reason: "السبب",
    message: "الرسالة",
    communicationResult: "نتيجة التواصل",
    resultNote: "ملاحظة النتيجة",
    baseAmount: "قيمة العلاج الأساسية",
    charges: "الرسوم",
    discounts: "الخصومات",
    finalTotal: "الإجمالي النهائي",
    paid: "المدفوع",
    outstanding: "المتبقي",
    paymentPercent: "نسبة السداد",
    paymentStatus: "حالة السداد",
    paymentDate: "تاريخ الدفعة",
    paymentLabel: "وصف الدفعة",
    amount: "المبلغ",
    paymentMethod: "طريقة الدفع",
    referenceNumber: "المرجع",
    voided: "ملغاة",
    voidReason: "سبب الإلغاء",
    installmentCount: "عدد الأقساط",
    firstDueDate: "أول استحقاق",
    sequence: "القسط",
    dueDate: "تاريخ الاستحقاق",
    paidAmount: "المدفوع",
    includeArchived: "يشمل المؤرشف",
    yes: "نعم",
    no: "لا",
    active: "نشط",
    archived: "مؤرشف",
  },
  en: {
    title: "Patient Medical Record",
    subtitle: "Professional patient record export",
    patientInfo: "Patient information",
    cases: "Implant cases",
    implants: "Implants",
    adjuncts: "Bone graft, sinus and adjunct procedures",
    prosthetics: "Prosthetic history",
    followups: "Follow-ups",
    communications: "Communications",
    finance: "Financial summary",
    payments: "Payments",
    installments: "Installments",
    field: "Field",
    value: "Value",
    case: "Case",
    name: "Patient name",
    fileNumber: "File number",
    mobile: "Mobile",
    age: "Age",
    status: "Status",
    createdAt: "File created",
    procedureDate: "Procedure date",
    doctor: "Treating doctor",
    referringDoctor: "Referring doctor",
    caseStatus: "Case status",
    prostheticValue: "Prosthetic plan",
    expectedProstheticDate: "Expected prosthetic date",
    reimplantation: "Reimplantation",
    note: "Note",
    site: "Site",
    system: "System",
    diameter: "Diameter",
    length: "Length",
    qValue: "Q",
    formerValue: "Former",
    graftValue: "Graft",
    procedureTags: "Procedures",
    implantStatus: "Implant status",
    date: "Date",
    category: "Category",
    type: "Type",
    side: "Side",
    liftType: "Lift type",
    material: "Material",
    membrane: "Membrane",
    quantity: "Quantity",
    size: "Size",
    procedureStatus: "Procedure status",
    eventType: "Prosthetic event",
    result: "Result",
    scheduledAt: "Scheduled",
    nextAppointment: "Next appointment",
    reason: "Reason",
    message: "Message",
    communicationResult: "Communication result",
    resultNote: "Result note",
    baseAmount: "Base treatment amount",
    charges: "Charges",
    discounts: "Discounts",
    finalTotal: "Final total",
    paid: "Paid",
    outstanding: "Outstanding",
    paymentPercent: "Payment percentage",
    paymentStatus: "Payment status",
    paymentDate: "Payment date",
    paymentLabel: "Payment description",
    amount: "Amount",
    paymentMethod: "Payment method",
    referenceNumber: "Reference",
    voided: "Voided",
    voidReason: "Void reason",
    installmentCount: "Installment count",
    firstDueDate: "First due date",
    sequence: "Installment",
    dueDate: "Due date",
    paidAmount: "Paid",
    includeArchived: "Includes archived",
    yes: "Yes",
    no: "No",
    active: "Active",
    archived: "Archived",
  },
} as const;

type Labels = (typeof LABELS)[ExportLocale];
type PatientRow = typeof patientsTable.$inferSelect;

function parseLocale(value: unknown): ExportLocale | undefined {
  return value === undefined ? "ar" : value === "ar" || value === "en" ? value : undefined;
}

function parseIncludeArchived(value: unknown): boolean | undefined {
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  return undefined;
}

function asText(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function dateValue(value: string | Date | null | undefined): string | Date | null {
  return value ?? null;
}

function caseLabel(index: number, locale: ExportLocale): string {
  return locale === "ar" ? `حالة ${index + 1}` : `Case ${index + 1}`;
}

function nonEmpty(section: ReportSection): boolean {
  return section.rows.length > 0;
}

function section<T extends ReportRow>(
  title: string,
  columns: ReportColumn[],
  rows: T[],
): ReportSection {
  return { title, columns, rows };
}

function financeAllowed(req: {
  currentMembership?: Parameters<typeof effectivePermissions>[0];
}): boolean {
  const membership = req.currentMembership;
  return Boolean(
    membership &&
      (membership.role === "ADMIN" ||
        effectivePermissions(membership).canViewFinancials),
  );
}

function money(value: string | number | null | undefined): number {
  return value == null ? 0 : Number(value);
}

async function loadRecord(
  patientId: string,
  tenantId: string,
  includeArchived: boolean,
  includeFinance: boolean,
) {
  const archived = (table: { archivedAt: unknown }) =>
    includeArchived ? undefined : isNull(table.archivedAt as never);
  const cases = await db
    .select()
    .from(implantCasesTable)
    .where(
      and(
        eq(implantCasesTable.patientId, patientId),
        eq(implantCasesTable.tenantId, tenantId),
        archived(implantCasesTable),
      ),
    )
    .orderBy(asc(implantCasesTable.procedureDate), asc(implantCasesTable.createdAt));
  const caseIds = cases.map((row) => row.id);
  if (!caseIds.length) {
    return {
      cases,
      implants: [],
      grafts: [],
      prosthetics: [],
      followups: [],
      communications: await db
        .select()
        .from(communicationsTable)
        .where(
          and(
            eq(communicationsTable.patientId, patientId),
            eq(communicationsTable.tenantId, tenantId),
          ),
        )
        .orderBy(desc(communicationsTable.createdAt)),
      charges: [],
      discounts: [],
      payments: [],
      plans: [],
      installments: [],
    };
  }
  const childArchived = <T extends { archivedAt: unknown }>(table: T) =>
    includeArchived ? undefined : isNull(table.archivedAt as never);
  const [implants, grafts, prosthetics, followups, communications] =
    await Promise.all([
      db.select().from(implantsTable).where(and(inArray(implantsTable.implantCaseId, caseIds), eq(implantsTable.tenantId, tenantId), childArchived(implantsTable))).orderBy(asc(implantsTable.createdAt)),
      db.select().from(boneGraftProceduresTable).where(and(inArray(boneGraftProceduresTable.implantCaseId, caseIds), eq(boneGraftProceduresTable.tenantId, tenantId), childArchived(boneGraftProceduresTable))).orderBy(asc(boneGraftProceduresTable.procedureDate), asc(boneGraftProceduresTable.createdAt)),
      db.select().from(prostheticEventsTable).where(and(inArray(prostheticEventsTable.implantCaseId, caseIds), eq(prostheticEventsTable.tenantId, tenantId), childArchived(prostheticEventsTable))).orderBy(asc(prostheticEventsTable.eventDate), asc(prostheticEventsTable.createdAt)),
      db.select().from(followupsTable).where(and(inArray(followupsTable.implantCaseId, caseIds), eq(followupsTable.tenantId, tenantId))).orderBy(desc(followupsTable.scheduledAt), desc(followupsTable.createdAt)),
      db.select().from(communicationsTable).where(and(eq(communicationsTable.patientId, patientId), eq(communicationsTable.tenantId, tenantId))).orderBy(desc(communicationsTable.createdAt)),
    ]);
  let charges: Array<typeof caseChargesTable.$inferSelect> = [];
  let discounts: Array<typeof caseDiscountsTable.$inferSelect> = [];
  let payments: Array<typeof paymentsTable.$inferSelect> = [];
  let plans: Array<typeof installmentPlansTable.$inferSelect> = [];
  if (includeFinance) {
    [charges, discounts, payments, plans] = await Promise.all([
      db.select().from(caseChargesTable).where(and(inArray(caseChargesTable.implantCaseId, caseIds), eq(caseChargesTable.tenantId, tenantId))).orderBy(asc(caseChargesTable.chargeDate), asc(caseChargesTable.createdAt)),
      db.select().from(caseDiscountsTable).where(and(inArray(caseDiscountsTable.implantCaseId, caseIds), eq(caseDiscountsTable.tenantId, tenantId))).orderBy(asc(caseDiscountsTable.discountDate), asc(caseDiscountsTable.createdAt)),
      db.select().from(paymentsTable).where(and(inArray(paymentsTable.implantCaseId, caseIds), eq(paymentsTable.tenantId, tenantId))).orderBy(asc(paymentsTable.paymentDate), asc(paymentsTable.createdAt)),
      db.select().from(installmentPlansTable).where(and(inArray(installmentPlansTable.implantCaseId, caseIds), eq(installmentPlansTable.tenantId, tenantId))),
    ]);
  }
  const planIds = plans.map((plan) => plan.id);
  const installments = planIds.length
    ? await db
        .select()
        .from(installmentsTable)
        .where(and(inArray(installmentsTable.planId, planIds), eq(installmentsTable.tenantId, tenantId)))
        .orderBy(asc(installmentsTable.sequence))
    : [];
  return {
    cases,
    implants,
    grafts,
    prosthetics,
    followups,
    communications,
    charges,
    discounts,
    payments,
    plans,
    installments,
  };
}

function buildDefinition(
  patient: PatientRow,
  data: Awaited<ReturnType<typeof loadRecord>>,
  locale: ExportLocale,
  includeArchived: boolean,
  includeFinance: boolean,
  clinicName: string,
): ReportDefinition {
  const l = LABELS[locale];
  const caseIndex = new Map(data.cases.map((row, index) => [row.id, caseLabel(index, locale)]));
  const sections: ReportSection[] = [];
  sections.push(
    section(l.patientInfo, [
      { key: "field", header: l.field, type: "text", width: 180 },
      {
        key: "value",
        header: l.value,
        type: "text",
        format: (value, row) =>
          row.field === l.createdAt && (value instanceof Date || typeof value === "string")
            ? formatRiyadhTimestamp(value, locale)
            : asText(value) ?? "—",
      },
    ], [
      { field: l.name, value: patient.fullName },
       { field: l.fileNumber, value: normalizeSystemDigits(patient.fileNumber) },
      { field: l.mobile, value: asText(patient.mobileNumber) },
      { field: l.age, value: patient.age },
      { field: l.status, value: patient.archivedAt ? l.archived : l.active },
      { field: l.createdAt, value: patient.createdAt },
    ]),
  );
  const cases = section(l.cases, [
     { key: "case", header: l.case, type: "text", width: 75, systemDigits: true },
    { key: "procedureDate", header: l.procedureDate, type: "date" },
    { key: "doctor", header: l.doctor, type: "text" },
    { key: "referringDoctor", header: l.referringDoctor, type: "text" },
    { key: "caseStatus", header: l.caseStatus, type: "text" },
    { key: "prostheticValue", header: l.prostheticValue, type: "text" },
    { key: "expectedProstheticDate", header: l.expectedProstheticDate, type: "date" },
    { key: "reimplantation", header: l.reimplantation, type: "text" },
    { key: "note", header: l.note, type: "text" },
  ], data.cases.map((row, index) => ({
    case: caseLabel(index, locale),
    procedureDate: dateValue(row.procedureDate),
    doctor: row.treatingDoctor,
    referringDoctor: asText(row.referringDoctor),
    caseStatus: localizeExportValue(row.caseStatus, locale),
    prostheticValue: asText(row.prosValue),
    expectedProstheticDate: dateValue(row.expectedProstheticDate),
    reimplantation: row.isReimplantation
      ? `${l.yes}${row.reimplantationReason ? ` — ${row.reimplantationReason}` : ""}`
      : l.no,
    note: asText(row.generalNote),
  })));
  if (nonEmpty(cases)) sections.push(cases);

  const implants = section(l.implants, [
    { key: "case", header: l.case, type: "text", width: 75 },
    { key: "site", header: l.site, type: "text" },
    { key: "system", header: l.system, type: "text" },
    { key: "diameter", header: l.diameter, type: "number" },
    { key: "length", header: l.length, type: "number" },
    { key: "qValue", header: l.qValue, type: "text" },
    { key: "formerValue", header: l.formerValue, type: "text" },
    { key: "graftValue", header: l.graftValue, type: "text" },
    { key: "procedureTags", header: l.procedureTags, type: "text" },
    { key: "implantStatus", header: l.implantStatus, type: "text" },
    { key: "note", header: l.note, type: "text" },
  ], data.implants.map((row) => ({
    case: caseIndex.get(row.implantCaseId) ?? "",
    site: row.site,
    system: asText(row.system),
    diameter: row.diameter == null ? null : money(row.diameter),
    length: row.length == null ? null : money(row.length),
    qValue: asText(row.qValue),
    formerValue: asText(row.formerValue),
    graftValue: asText(row.graftValue),
    procedureTags: row.procedureTags?.filter(Boolean).join(", ") || null,
    implantStatus: localizeExportValue(row.implantStatus, locale),
    note: asText(row.implantNote),
  })));
  if (nonEmpty(implants)) sections.push(implants);

  const adjuncts = section(l.adjuncts, [
    { key: "case", header: l.case, type: "text", width: 75 },
    { key: "date", header: l.date, type: "date" },
    { key: "category", header: l.category, type: "text" },
    { key: "type", header: l.type, type: "text" },
    { key: "side", header: l.side, type: "text" },
    { key: "liftType", header: l.liftType, type: "text" },
    { key: "site", header: l.site, type: "text" },
    { key: "material", header: l.material, type: "text" },
    { key: "membrane", header: l.membrane, type: "text" },
    { key: "quantity", header: l.quantity, type: "text" },
    { key: "size", header: l.size, type: "text" },
    { key: "doctor", header: l.doctor, type: "text" },
    { key: "procedureStatus", header: l.procedureStatus, type: "text" },
    { key: "note", header: l.note, type: "text" },
  ], data.grafts.map((row) => ({
    case: caseIndex.get(row.implantCaseId) ?? "",
    date: row.procedureDate,
    category: localizeExportValue(row.procedureCategory, locale),
    type: localizeExportValue(row.procedureType, locale),
    side: localizeExportValue(asText(row.procedureSide), locale),
    liftType: localizeExportValue(asText(row.liftType), locale),
    site: asText(row.site),
    material: asText(row.material),
    membrane: asText(row.membrane),
    quantity: asText(row.quantity),
    size: asText(row.size),
    doctor: row.treatingDoctor,
    procedureStatus: localizeExportValue(row.procedureStatus, locale),
    note: asText(row.note),
  })));
  if (nonEmpty(adjuncts)) sections.push(adjuncts);

  const prosthetics = section(l.prosthetics, [
    { key: "case", header: l.case, type: "text", width: 75 },
    { key: "date", header: l.date, type: "date" },
    { key: "eventType", header: l.eventType, type: "text" },
    { key: "note", header: l.note, type: "text" },
  ], data.prosthetics.map((row) => ({
    case: caseIndex.get(row.implantCaseId) ?? "",
    date: row.eventDate,
    eventType: localizeExportValue(row.eventType, locale),
    note: asText(row.note),
  })));
  if (nonEmpty(prosthetics)) sections.push(prosthetics);

  const followups = section(l.followups, [
    { key: "case", header: l.case, type: "text", width: 75 },
    { key: "type", header: l.type, type: "text" },
    { key: "status", header: l.status, type: "text" },
    { key: "scheduledAt", header: l.scheduledAt, type: "date" },
    { key: "result", header: l.result, type: "text" },
    { key: "nextAppointment", header: l.nextAppointment, type: "date" },
    { key: "note", header: l.note, type: "text" },
  ], data.followups.map((row) => ({
    case: caseIndex.get(row.implantCaseId) ?? "",
    type: localizeExportValue(row.followupType, locale),
    status: localizeExportValue(row.followupStatus, locale),
    scheduledAt: dateValue(row.scheduledAt),
    result: localizeExportValue(asText(row.result), locale),
    nextAppointment: dateValue(row.nextAppointmentAt),
    note: asText(row.note),
  })));
  if (nonEmpty(followups)) sections.push(followups);

  const communications = section(l.communications, [
    { key: "date", header: l.date, type: "date" },
    { key: "case", header: l.case, type: "text", width: 75 },
    { key: "reason", header: l.reason, type: "text" },
    { key: "message", header: l.message, type: "text" },
    { key: "communicationResult", header: l.communicationResult, type: "text" },
    { key: "resultNote", header: l.resultNote, type: "text" },
  ], data.communications.map((row) => ({
    date: dateValue(row.openedAt ?? row.createdAt),
    case: row.implantCaseId ? (caseIndex.get(row.implantCaseId) ?? "") : null,
    reason: localizeExportValue(asText(row.communicationReason), locale),
    message: asText(row.renderedMessage),
    communicationResult: localizeExportValue(asText(row.communicationResult), locale),
    resultNote: asText(row.resultNote),
  })));
  if (nonEmpty(communications)) sections.push(communications);

  if (includeFinance) {
    const summaries = data.cases.map((row, index) => {
      const charges = data.charges.filter((item) => item.implantCaseId === row.id);
      const discounts = data.discounts.filter((item) => item.implantCaseId === row.id);
      const payments = data.payments.filter((item) => item.implantCaseId === row.id);
      return {
        row,
        index,
        summary: buildSummary({
          implantCaseId: row.id,
          caseStatus: row.caseStatus,
          baseTreatmentAmount: money(row.baseTreatmentAmount),
          chargesTotal: charges.reduce((sum, item) => sum + money(item.amount), 0),
          discountsTotal: discounts.reduce((sum, item) => sum + money(item.amount), 0),
          paidAmount: payments
            .filter((item) => !item.voidedAt)
            .reduce((sum, item) => sum + money(item.amount), 0),
        }),
      };
    });
    const financialSummaries = section(l.finance, [
      { key: "case", header: l.case, type: "text", width: 75 },
      { key: "baseAmount", header: l.baseAmount, type: "currency" },
      { key: "charges", header: l.charges, type: "currency" },
      { key: "discounts", header: l.discounts, type: "currency" },
      { key: "finalTotal", header: l.finalTotal, type: "currency" },
      { key: "paid", header: l.paid, type: "currency" },
      { key: "outstanding", header: l.outstanding, type: "currency" },
      { key: "paymentPercent", header: l.paymentPercent, type: "percentage" },
      { key: "paymentStatus", header: l.paymentStatus, type: "text" },
    ], summaries.map(({ summary, index }) => ({
      case: caseLabel(index, locale),
      baseAmount: summary.baseTreatmentAmount,
      charges: summary.chargesTotal,
      discounts: summary.discountsTotal,
      finalTotal: summary.finalTotal,
      paid: summary.paidAmount,
      outstanding: summary.outstanding,
      paymentPercent: summary.paymentPercent == null ? null : summary.paymentPercent / 100,
      paymentStatus: localizeExportValue(summary.paymentStatus, locale),
    })));
    if (nonEmpty(financialSummaries)) sections.push(financialSummaries);

    const payments = section(l.payments, [
      { key: "case", header: l.case, type: "text", width: 75 },
      { key: "paymentDate", header: l.paymentDate, type: "date" },
      { key: "paymentLabel", header: l.paymentLabel, type: "text" },
      { key: "amount", header: l.amount, type: "currency" },
      { key: "paymentMethod", header: l.paymentMethod, type: "text" },
      { key: "referenceNumber", header: l.referenceNumber, type: "text" },
      { key: "voided", header: l.voided, type: "boolean" },
      { key: "voidReason", header: l.voidReason, type: "text" },
      { key: "note", header: l.note, type: "text" },
    ], data.payments.map((row) => ({
      case: caseIndex.get(row.implantCaseId) ?? "",
      paymentDate: row.paymentDate,
      paymentLabel: localizeExportValue(asText(row.paymentLabel), locale),
      amount: money(row.amount),
      paymentMethod: localizeExportValue(asText(row.paymentMethod), locale),
      referenceNumber: asText(row.referenceNumber),
      voided: Boolean(row.voidedAt),
      voidReason: asText(row.voidReason),
      note: asText(row.note),
    })));
    if (nonEmpty(payments)) sections.push(payments);

    const planRows = data.plans.flatMap((plan) => {
      const caseName = caseIndex.get(plan.implantCaseId) ?? "";
      const planInstallments = data.installments.filter((item) => item.planId === plan.id);
      const paymentRows = data.payments.filter((item) => item.implantCaseId === plan.implantCaseId);
      const dto = buildInstallmentPlanDto({
        plan,
        installments: planInstallments,
        payments: paymentRows,
      });
      return dto.installments.map((item) => ({
        case: caseName,
        installmentCount: dto.installmentCount,
        firstDueDate: dto.firstDueDate,
        sequence: item.sequence,
        dueDate: item.dueDate,
        amount: item.amount,
        paidAmount: item.paidAmount,
        outstanding: item.outstanding,
        status: localizeExportValue(item.status, locale),
      }));
    });
    const installments = section(l.installments, [
      { key: "case", header: l.case, type: "text", width: 75 },
      { key: "installmentCount", header: l.installmentCount, type: "number" },
      { key: "firstDueDate", header: l.firstDueDate, type: "date" },
      { key: "sequence", header: l.sequence, type: "number" },
      { key: "dueDate", header: l.dueDate, type: "date" },
      { key: "amount", header: l.amount, type: "currency" },
      { key: "paidAmount", header: l.paidAmount, type: "currency" },
      { key: "outstanding", header: l.outstanding, type: "currency" },
      { key: "status", header: l.status, type: "text" },
    ], planRows);
    if (nonEmpty(installments)) sections.push(installments);
  }

  return {
    metadata: {
      title: l.title,
      subtitle: `${l.subtitle} — ${patient.fullName}`,
      clinicName,
      generatedAt: new Date(),
      filters: {
        [l.fileNumber]: patient.fileNumber,
        [l.includeArchived]: includeArchived ? l.yes : l.no,
        ...(includeFinance ? { [l.finance]: l.yes } : {}),
      },
      filename: `patient-record-${patient.fileNumber}`,
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      orientation: "landscape",
    },
    sections,
  };
}

function rowCount(report: ReportDefinition): number {
  return (report.sections ?? []).reduce((count, item) => count + item.rows.length, 0);
}

router.get("/patients/:id/export.pdf", async (req, res) => {
  await exportPatientRecord(req, res, "pdf");
});

router.get("/patients/:id/export.xlsx", async (req, res) => {
  await exportPatientRecord(req, res, "xlsx");
});

async function exportPatientRecord(
  req: Request,
  res: Response,
  format: ExportFormat,
): Promise<void> {
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const locale = parseLocale(req.query.locale);
  if (!locale) {
    res.status(400).json({ error: "locale must be ar or en", code: "VALIDATION_ERROR" });
    return;
  }
  const includeArchived = parseIncludeArchived(req.query.includeArchived);
  if (includeArchived === undefined) {
    res.status(400).json({ error: "includeArchived must be true or false", code: "VALIDATION_ERROR" });
    return;
  }
  const tenantId = req.currentTenant!.id;
  const [patient] = await db
    .select()
    .from(patientsTable)
    .where(
      and(
        eq(patientsTable.id, id),
        eq(patientsTable.tenantId, tenantId),
        includeArchived ? undefined : isNull(patientsTable.archivedAt),
      ),
    )
    .limit(1);
  if (!patient) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  const includeFinance = financeAllowed(req);
  const data = await loadRecord(patient.id, tenantId, includeArchived, includeFinance);
  // Keep the canonical case finance loader in the export path. Its tenant
  // predicate and calculation are the source of truth for active records;
  // buildSummary above supplies the same canonical calculation when archived
  // history is explicitly requested.
  if (includeFinance) await loadCaseFinancials({}, tenantId);
  const report = buildDefinition(
    patient,
    data,
    locale,
    includeArchived,
    includeFinance,
    req.currentTenant!.name,
  );
  const rendered = format === "pdf" ? await renderPdf(report) : await renderXlsx(report);
  await writeAudit({
    tenantId,
    userId: req.currentUser?.id,
    action: "patient_record_export",
    entityType: "patient",
    entityId: patient.id,
    summary: `تصدير السجل الطبي (${format}) للمريض ${patient.fileNumber}`,
    details: {
      format,
      fileNumber: patient.fileNumber,
      includeArchived,
      includeFinance,
      counts: {
        cases: data.cases.length,
        implants: data.implants.length,
        adjuncts: data.grafts.length,
        prosthetics: data.prosthetics.length,
        followups: data.followups.length,
        communications: data.communications.length,
        charges: includeFinance ? data.charges.length : 0,
        discounts: includeFinance ? data.discounts.length : 0,
        payments: includeFinance ? data.payments.length : 0,
        installmentPlans: includeFinance ? data.plans.length : 0,
        installments: includeFinance ? data.installments.length : 0,
      },
    },
  });
  res.setHeader("Content-Type", rendered.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${rendered.filename}"`);
  res.send(rendered.data);
}

export default router;