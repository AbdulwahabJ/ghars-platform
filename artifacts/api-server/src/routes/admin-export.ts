import { Router, type IRouter, type Request, type Response } from "express";
import {
  caseChargesTable,
  caseDiscountsTable,
  communicationsTable,
  db,
  followupsTable,
  implantCasesTable,
  implantsTable,
  patientsTable,
  paymentsTable,
  usersTable,
  whatsappTemplatesTable,
} from "@workspace/db";
import {
  EXPORT_ENTITIES,
  EXPORT_ENTITY_LABELS,
  type ExportEntity,
} from "@workspace/shared";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../lib/audit";
import { sendCsv, toCsv } from "../lib/csv";
import { formatCellValue, renderPdf, renderXlsx } from "../lib/export/index.js";
import { localizeExportValue } from "../lib/export-localization";
import type { ReportColumn, ReportDefinition, ReportRow } from "../lib/export/index.js";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/export", requireAuth, requireRole("ADMIN"));

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");

type ExportLocale = "ar" | "en";

const ENTITY_ENGLISH_LABELS: Record<ExportEntity, string> = {
  patients: "Patients",
  cases: "Implant cases",
  implants: "Implants",
  payments: "Payments",
  charges: "Additional charges",
  discounts: "Discounts",
  followups: "Follow-ups",
  communications: "Communications",
};

const ENGLISH_HEADERS: Record<ExportEntity, string[]> = {
  patients: [
    "File number", "Full name", "Mobile number", "Age", "Administrative note",
    "Added at", "Archived at",
  ],
  cases: [
    "Patient file number", "Patient name", "Procedure date", "Treating doctor",
    "Referring doctor", "Case status", "Pros", "Expected prosthetic date",
    "Base treatment amount", "General note", "Legacy financial note",
    "Reimplantation", "Reimplantation reason", "Archived at",
  ],
  implants: [
    "Patient file number", "Procedure date", "Site", "System", "Diameter",
    "Length", "Q", "Former", "Graft", "Graft type", "Graft note",
    "Procedure tags", "Implant status", "Note", "Archived at",
  ],
  payments: [
    "Patient file number", "Procedure date", "Amount", "Payment date",
    "Payment description", "Payment method", "Reference number", "Note",
    "Recorded by", "Voided at", "Voided by", "Void reason",
  ],
  charges: [
    "Patient file number", "Procedure date", "Charge type", "Description",
    "Amount", "Charge date", "Note",
  ],
  discounts: [
    "Patient file number", "Procedure date", "Amount", "Discount date",
    "Reason", "Approved by", "Entered at",
  ],
  followups: [
    "Patient file number", "Procedure date", "Follow-up type", "Follow-up time",
    "Status", "Requires contact", "Contact due", "Next appointment",
    "Assigned to", "Note",
  ],
  communications: [
    "Patient file number", "Communication reason", "Template", "Sent message",
    "Opened at", "Result", "Result note", "User", "Entered at",
  ],
};

/** Binary reports are deliberately single-locale. CSV keeps its historical
 * Arabic headings for import/backwards compatibility. */
const ARABIC_HEADERS: Record<ExportEntity, string[]> = {
  patients: ["رقم الملف", "الاسم الكامل", "رقم الجوال", "العمر", "ملاحظة إدارية", "تاريخ الإضافة", "مؤرشف في"],
  cases: ["رقم ملف المريض", "اسم المريض", "تاريخ العملية", "الطبيب المعالج", "الطبيب المحوِّل", "حالة الحالة", "مدة الـ Pros", "تاريخ التركيب المتوقع", "المبلغ الأساسي للعلاج", "ملاحظة عامة", "ملاحظة مالية قديمة", "إعادة زراعة", "سبب إعادة الزراعة", "مؤرشفة في"],
  implants: ["رقم ملف المريض", "تاريخ العملية", "الموقع", "النظام", "القطر", "الطول", "قيمة Q", "قيمة Former", "قيمة Graft", "نوع الطعم", "ملاحظة الطعم", "وسوم الإجراء", "حالة الزرعة", "ملاحظة", "مؤرشفة في"],
  payments: ["رقم ملف المريض", "تاريخ العملية", "المبلغ", "تاريخ الدفعة", "وصف الدفعة", "طريقة الدفع", "الرقم المرجعي", "ملاحظة", "سجّلها", "ملغاة في", "ألغاها", "سبب الإلغاء"],
  charges: ["رقم ملف المريض", "تاريخ العملية", "نوع الرسم", "الوصف", "المبلغ", "تاريخ الرسم", "ملاحظة"],
  discounts: ["رقم ملف المريض", "تاريخ العملية", "المبلغ", "تاريخ الخصم", "السبب", "اعتمده", "تاريخ الإدخال"],
  followups: ["رقم ملف المريض", "تاريخ العملية", "نوع المتابعة", "موعد المتابعة", "الحالة", "يتطلب تواصلًا", "موعد التواصل", "الموعد التالي", "المسؤول", "ملاحظة"],
  communications: ["رقم ملف المريض", "سبب التواصل", "القالب", "الرسالة المرسلة", "فُتح في", "النتيجة", "ملاحظة النتيجة", "المستخدم", "تاريخ الإدخال"],
};

const STATUS_LABELS: Record<string, [string, string]> = {
  planned: ["مخطط", "Planned"], completed: ["مكتمل", "Completed"],
  cancelled: ["ملغى", "Cancelled"], active: ["نشط", "Active"],
  pending: ["قيد الانتظار", "Pending"], overdue: ["متأخر", "Overdue"],
  scheduled: ["مجدول", "Scheduled"], sent: ["تم الإرسال", "Sent"],
  delivered: ["تم التسليم", "Delivered"], failed: ["فشل", "Failed"],
  implanted: ["مزروعة", "Implanted"],
};

function localizedValue(value: unknown, locale: ExportLocale): unknown {
  if (value === "نعم" || value === "Yes" || value === true) return locale === "ar" ? "نعم" : "Yes";
  if (value === "لا" || value === "No" || value === false) return locale === "ar" ? "لا" : "No";
  if (typeof value === "string") {
    const localized = localizeExportValue(value, locale);
    if (localized !== value) return localized;
    const label = STATUS_LABELS[value.toLowerCase()];
    if (label) return label[locale === "ar" ? 0 : 1];
  }
  return value;
}

/** The fields with intrinsic numeric/date types in each canonical export. */
const COLUMN_TYPES: Record<ExportEntity, Record<number, ReportColumn["type"]>> = {
  patients: { 3: "number", 5: "date", 6: "date" },
  cases: { 2: "date", 7: "date", 8: "currency", 13: "date" },
  implants: { 1: "date", 14: "date" },
  payments: { 1: "date", 2: "currency", 3: "date", 9: "date" },
  charges: { 1: "date", 4: "currency", 5: "date" },
  discounts: { 1: "date", 2: "currency", 3: "date", 6: "date" },
  followups: { 1: "date", 3: "date", 6: "date", 7: "date" },
  communications: { 4: "date", 8: "date" },
};

const PDF_COLUMN_LAYOUTS: Record<
  ExportEntity,
  Array<{ index: number; width: number }>
> = {
  patients: [
    { index: 0, width: 70 }, { index: 1, width: 140 },
    { index: 2, width: 105 }, { index: 3, width: 50 },
    { index: 5, width: 85 }, { index: 6, width: 61 },
  ],
  cases: [
    { index: 0, width: 60 }, { index: 1, width: 110 },
    { index: 2, width: 75 }, { index: 3, width: 90 },
    { index: 5, width: 100 }, { index: 7, width: 75 },
    { index: 8, width: 85 }, { index: 9, width: 162 },
  ],
  implants: [
    { index: 0, width: 60 }, { index: 1, width: 75 },
    { index: 2, width: 55 }, { index: 3, width: 85 },
    { index: 4, width: 45 }, { index: 5, width: 45 },
    { index: 8, width: 70 }, { index: 9, width: 90 },
    { index: 12, width: 85 }, { index: 13, width: 147 },
  ],
  payments: [
    { index: 0, width: 75 }, { index: 3, width: 80 },
    { index: 2, width: 85 }, { index: 5, width: 80 },
    { index: 6, width: 90 }, { index: 4, width: 105 },
    { index: 8, width: 105 }, { index: 7, width: 137 },
  ],
  charges: [
    { index: 0, width: 70 }, { index: 1, width: 80 },
    { index: 2, width: 95 }, { index: 3, width: 145 },
    { index: 4, width: 85 }, { index: 5, width: 80 },
    { index: 6, width: 202 },
  ],
  discounts: [
    { index: 0, width: 75 }, { index: 1, width: 80 },
    { index: 2, width: 90 }, { index: 3, width: 80 },
    { index: 4, width: 190 }, { index: 5, width: 120 },
    { index: 6, width: 122 },
  ],
  followups: [
    { index: 0, width: 65 }, { index: 1, width: 72 },
    { index: 2, width: 105 }, { index: 3, width: 85 },
    { index: 4, width: 75 }, { index: 6, width: 80 },
    { index: 7, width: 80 }, { index: 8, width: 85 },
    { index: 9, width: 110 },
  ],
  communications: [
    { index: 0, width: 70 }, { index: 1, width: 100 },
    { index: 2, width: 105 }, { index: 4, width: 85 },
    { index: 5, width: 90 }, { index: 6, width: 132 },
    { index: 7, width: 90 }, { index: 8, width: 85 },
  ],
};

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

function toReport(
  entity: ExportEntity,
  headers: string[],
  rows: unknown[][],
  locale: ExportLocale,
  clinicName: string,
  format: "pdf" | "xlsx",
): ReportDefinition {
  const reportHeaders = locale === "ar" ? ARABIC_HEADERS[entity] : ENGLISH_HEADERS[entity];
  const types = COLUMN_TYPES[entity];
  const allColumns: ReportColumn[] = headers.map((_header, index) => ({
    key: `column_${index}`,
    header: reportHeaders[index] ?? "",
    type: types[index],
    width: types[index] === "date" ? 18 : types[index] === "currency" ? 16 : undefined,
  }));
  const columns = format === "pdf"
    ? PDF_COLUMN_LAYOUTS[entity].map(({ index, width }) => ({
        ...allColumns[index],
        width,
        align: allColumns[index].type === "number" || allColumns[index].type === "currency"
          ? "right" as const
          : undefined,
      }))
    : allColumns;
  const reportRows: ReportRow[] = rows.map((values) => {
    const row: ReportRow = {};
    values.forEach((value, index) => {
      const type = types[index];
      if (
        (type === "number" || type === "currency") &&
        value !== null &&
        value !== undefined &&
        value !== ""
      ) {
        const number = typeof value === "number" ? value : Number(value);
        row[`column_${index}`] = Number.isFinite(number) ? number : String(value);
      } else {
        const reportValue = type === "date" && value
          ? value instanceof Date ? value : new Date(String(value))
          : localizedValue(value, locale);
        row[`column_${index}`] = reportValue as ReportRow[string];
      }
    });
    return row;
  });
  return {
    metadata: {
      title: locale === "ar"
        ? `تقرير ${EXPORT_ENTITY_LABELS[entity]}`
        : `${ENTITY_ENGLISH_LABELS[entity]} report`,
      subtitle: locale === "ar" ? "تصدير بيانات المنشأة" : "Organization data export",
      clinicName,
      locale,
      direction: locale === "ar" ? "rtl" : "ltr",
      orientation: format === "pdf" && entity === "patients" ? "portrait" : "landscape",
      filename: entity,
    },
    sections: [
      ...(format === "pdf" && entity === "payments"
        ? [{
            title: locale === "ar" ? "ملخص الدفعات" : "Payment summary",
            columns: [
              { key: "metric", header: locale === "ar" ? "المؤشر" : "Metric", width: 250 },
              { key: "value", header: locale === "ar" ? "القيمة" : "Value", width: 250 },
            ],
            rows: [
              {
                metric: locale === "ar" ? "إجمالي الدفعات" : "Total payments",
                value: formatCellValue(
                  rows.reduce((sum, row) => sum + (Number(row[2]) || 0), 0),
                  { key: "amount", header: "", type: "currency" },
                  {},
                  locale,
                ),
              },
              {
                metric: locale === "ar" ? "عدد الدفعات" : "Payment count",
                value: rows.length,
              },
            ],
          }]
        : []),
      {
        title: locale === "ar" ? EXPORT_ENTITY_LABELS[entity] : ENTITY_ENGLISH_LABELS[entity],
        columns,
        rows: reportRows,
      },
    ],
  };
}

/**
 * Complete operational data export — one CSV per entity. User references are
 * exported as display names; password hashes, sessions, tokens and secrets
 * are never part of any export.
 */
async function buildExport(
  entity: ExportEntity,
  tenantId: string,
): Promise<{ headers: string[]; rows: unknown[][] }> {
  switch (entity) {
    default:
      throw new Error(`unknown export entity: ${entity as string}`);
    case "patients": {
      const rows = await db
        .select()
        .from(patientsTable)
         .where(eq(patientsTable.tenantId, tenantId))
        .orderBy(asc(patientsTable.fileNumber));
      return {
        headers: [
          "رقم الملف",
          "الاسم الكامل",
          "رقم الجوال",
          "العمر",
          "ملاحظة إدارية",
          "تاريخ الإضافة",
          "مؤرشف في",
        ],
        rows: rows.map((p) => [
          p.fileNumber,
          p.fullName,
          p.mobileNumber ?? "",
          p.age ?? "",
          p.administrativeNote ?? "",
          iso(p.createdAt),
          iso(p.archivedAt),
        ]),
      };
    }
    case "cases": {
      const rows = await db
        .select({
          caseRow: implantCasesTable,
          fileNumber: patientsTable.fileNumber,
          patientName: patientsTable.fullName,
        })
        .from(implantCasesTable)
        .innerJoin(
          patientsTable,
          eq(patientsTable.id, implantCasesTable.patientId),
        )
         .where(eq(implantCasesTable.tenantId, tenantId))
        .orderBy(asc(patientsTable.fileNumber), asc(implantCasesTable.createdAt));
      return {
        headers: [
          "رقم ملف المريض",
          "اسم المريض",
          "تاريخ العملية",
          "الطبيب المعالج",
          "الطبيب المحوِّل",
          "حالة الحالة",
          "Pros",
          "تاريخ التركيب المتوقع",
          "المبلغ الأساسي للعلاج",
          "ملاحظة عامة",
          "ملاحظة مالية قديمة",
          "إعادة زراعة",
          "سبب إعادة الزراعة",
          "مؤرشفة في",
        ],
        rows: rows.map(({ caseRow: c, fileNumber, patientName }) => [
          fileNumber,
          patientName,
          c.procedureDate ?? "",
          c.treatingDoctor,
          c.referringDoctor ?? "",
          c.caseStatus,
          c.prosValue ?? "",
          c.expectedProstheticDate ?? "",
          c.baseTreatmentAmount,
          c.generalNote ?? "",
          c.legacyCostNote ?? "",
          c.isReimplantation ? "نعم" : "لا",
          c.reimplantationReason ?? "",
          iso(c.archivedAt),
        ]),
      };
    }
    case "implants": {
      const rows = await db
        .select({
          implant: implantsTable,
          fileNumber: patientsTable.fileNumber,
          procedureDate: implantCasesTable.procedureDate,
        })
        .from(implantsTable)
        .innerJoin(
          implantCasesTable,
          eq(implantCasesTable.id, implantsTable.implantCaseId),
        )
        .innerJoin(
          patientsTable,
          eq(patientsTable.id, implantCasesTable.patientId),
        )
         .where(eq(implantsTable.tenantId, tenantId))
        .orderBy(asc(patientsTable.fileNumber), asc(implantsTable.createdAt));
      return {
        headers: [
          "رقم ملف المريض",
          "تاريخ العملية",
          "الموقع",
          "النظام",
          "القطر",
          "الطول",
          "Q",
          "Former",
          "Graft",
          "نوع الطعم",
          "ملاحظة الطعم",
          "وسوم الإجراء",
          "حالة الزرعة",
          "ملاحظة",
          "مؤرشفة في",
        ],
        rows: rows.map(({ implant: i, fileNumber, procedureDate }) => [
          fileNumber,
          procedureDate ?? "",
          i.site,
          i.system ?? "",
          i.diameter ?? "",
          i.length ?? "",
          i.qValue ?? "",
          i.formerValue ?? "",
          i.graftValue ?? "",
          i.graftProcedureType ?? "",
          i.graftNote ?? "",
          (i.procedureTags ?? []).join("؛ "),
          i.implantStatus,
          i.implantNote ?? "",
          iso(i.archivedAt),
        ]),
      };
    }
    case "payments": {
      const voidedByUser = alias(usersTable, "voided_by_user");
      const rows = await db
        .select({
          payment: paymentsTable,
          fileNumber: patientsTable.fileNumber,
          procedureDate: implantCasesTable.procedureDate,
          createdByName: usersTable.fullName,
          voidedByName: voidedByUser.fullName,
        })
        .from(paymentsTable)
        .innerJoin(
          implantCasesTable,
          eq(implantCasesTable.id, paymentsTable.implantCaseId),
        )
        .innerJoin(
          patientsTable,
          eq(patientsTable.id, implantCasesTable.patientId),
        )
        .leftJoin(usersTable, eq(usersTable.id, paymentsTable.createdBy))
        .leftJoin(voidedByUser, eq(voidedByUser.id, paymentsTable.voidedBy))
         .where(eq(paymentsTable.tenantId, tenantId))
        .orderBy(asc(patientsTable.fileNumber), asc(paymentsTable.paymentDate));
      return {
        headers: [
          "رقم ملف المريض",
          "تاريخ العملية",
          "المبلغ",
          "تاريخ الدفعة",
          "وصف الدفعة",
          "طريقة الدفع",
          "الرقم المرجعي",
          "ملاحظة",
          "سجّلها",
          "ملغاة في",
          "ألغاها",
          "سبب الإلغاء",
        ],
        rows: rows.map(
          ({ payment: p, fileNumber, procedureDate, createdByName, voidedByName }) => [
            fileNumber,
            procedureDate ?? "",
            p.amount,
            p.paymentDate,
            p.paymentLabel ?? "",
            p.paymentMethod ?? "",
            p.referenceNumber ?? "",
            p.note ?? "",
            createdByName ?? "",
            iso(p.voidedAt),
            voidedByName ?? "",
            p.voidReason ?? "",
          ],
        ),
      };
    }
    case "charges": {
      const rows = await db
        .select({
          charge: caseChargesTable,
          fileNumber: patientsTable.fileNumber,
          procedureDate: implantCasesTable.procedureDate,
        })
        .from(caseChargesTable)
        .innerJoin(
          implantCasesTable,
          eq(implantCasesTable.id, caseChargesTable.implantCaseId),
        )
        .innerJoin(
          patientsTable,
          eq(patientsTable.id, implantCasesTable.patientId),
        )
         .where(eq(caseChargesTable.tenantId, tenantId))
        .orderBy(asc(patientsTable.fileNumber), asc(caseChargesTable.chargeDate));
      return {
        headers: [
          "رقم ملف المريض",
          "تاريخ العملية",
          "نوع الرسم",
          "الوصف",
          "المبلغ",
          "تاريخ الرسم",
          "ملاحظة",
        ],
        rows: rows.map(({ charge: c, fileNumber, procedureDate }) => [
          fileNumber,
          procedureDate ?? "",
          c.chargeType ?? "",
          c.description ?? "",
          c.amount,
          c.chargeDate,
          c.note ?? "",
        ]),
      };
    }
    case "discounts": {
      const rows = await db
        .select({
          discount: caseDiscountsTable,
          fileNumber: patientsTable.fileNumber,
          procedureDate: implantCasesTable.procedureDate,
        })
        .from(caseDiscountsTable)
        .innerJoin(
          implantCasesTable,
          eq(implantCasesTable.id, caseDiscountsTable.implantCaseId),
        )
        .innerJoin(
          patientsTable,
          eq(patientsTable.id, implantCasesTable.patientId),
        )
         .where(eq(caseDiscountsTable.tenantId, tenantId))
        .orderBy(
          asc(patientsTable.fileNumber),
          asc(caseDiscountsTable.createdAt),
        );
      return {
        headers: [
          "رقم ملف المريض",
          "تاريخ العملية",
          "المبلغ",
          "تاريخ الخصم",
          "السبب",
          "اعتمده",
          "تاريخ الإدخال",
        ],
        rows: rows.map(({ discount: d, fileNumber, procedureDate }) => [
          fileNumber,
          procedureDate ?? "",
          d.amount,
          d.discountDate,
          d.reason ?? "",
          d.approvedBy ?? "",
          iso(d.createdAt),
        ]),
      };
    }
    case "followups": {
      const assignedUser = alias(usersTable, "assigned_user");
      const rows = await db
        .select({
          followup: followupsTable,
          fileNumber: patientsTable.fileNumber,
          procedureDate: implantCasesTable.procedureDate,
          assignedName: assignedUser.fullName,
        })
        .from(followupsTable)
        .innerJoin(
          implantCasesTable,
          eq(implantCasesTable.id, followupsTable.implantCaseId),
        )
        .innerJoin(patientsTable, eq(patientsTable.id, followupsTable.patientId))
        .leftJoin(
          assignedUser,
          eq(assignedUser.id, followupsTable.assignedUserId),
        )
         .where(eq(followupsTable.tenantId, tenantId))
        .orderBy(asc(patientsTable.fileNumber), asc(followupsTable.createdAt));
      return {
        headers: [
          "رقم ملف المريض",
          "تاريخ العملية",
          "نوع المتابعة",
          "موعد المتابعة",
          "الحالة",
          "يتطلب تواصلًا",
          "موعد التواصل",
          "الموعد التالي",
          "المسؤول",
          "ملاحظة",
        ],
        rows: rows.map(
          ({ followup: f, fileNumber, procedureDate, assignedName }) => [
            fileNumber,
            procedureDate ?? "",
            f.followupType,
            iso(f.scheduledAt),
            f.followupStatus,
            f.requiresContact ? "نعم" : "لا",
            iso(f.contactDueAt),
            iso(f.nextAppointmentAt),
            assignedName ?? "",
            f.note ?? "",
          ],
        ),
      };
    }
    case "communications": {
      const rows = await db
        .select({
          comm: communicationsTable,
          fileNumber: patientsTable.fileNumber,
          templateName: whatsappTemplatesTable.name,
          userName: usersTable.fullName,
        })
        .from(communicationsTable)
        .innerJoin(
          patientsTable,
          eq(patientsTable.id, communicationsTable.patientId),
        )
        .leftJoin(
          whatsappTemplatesTable,
          eq(whatsappTemplatesTable.id, communicationsTable.templateId),
        )
        .leftJoin(usersTable, eq(usersTable.id, communicationsTable.userId))
         .where(eq(communicationsTable.tenantId, tenantId))
        .orderBy(asc(communicationsTable.createdAt));
      return {
        headers: [
          "رقم ملف المريض",
          "سبب التواصل",
          "القالب",
          "الرسالة المرسلة",
          "فُتح في",
          "النتيجة",
          "ملاحظة النتيجة",
          "المستخدم",
          "تاريخ الإدخال",
        ],
        rows: rows.map(({ comm: c, fileNumber, templateName, userName }) => [
          fileNumber,
          c.communicationReason ?? "",
          templateName ?? "",
          c.renderedMessage ?? "",
          iso(c.openedAt),
          c.communicationResult ?? "",
          c.resultNote ?? "",
          userName ?? "",
          iso(c.createdAt),
        ]),
      };
    }
  }
}

router.get("/admin/export/:entity.csv", async (req, res) => {
  const entity = req.params.entity as ExportEntity;
  if (!EXPORT_ENTITIES.includes(entity)) {
    res.status(400).json({ error: "نوع التصدير غير معروف.", code: "VALIDATION_ERROR" });
    return;
  }
  const tenantId = req.currentTenant!.id;
  const { headers, rows } = await buildExport(entity, tenantId);
  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "data_export",
    entityType: entity,
    summary: `تصدير بيانات ${entity} (${rows.length} سجلًا)`,
    details: { entity, format: "csv", rowCount: rows.length },
  });
  sendCsv(res, `${entity}.csv`, toCsv(headers, rows));
});

async function sendBinaryExport(
  req: Request,
  res: Response,
  format: "pdf" | "xlsx",
): Promise<void> {
  const entity = req.params.entity as ExportEntity;
  if (!EXPORT_ENTITIES.includes(entity)) {
    res.status(400).json({ error: "نوع التصدير غير معروف.", code: "VALIDATION_ERROR" });
    return;
  }
  const locale = requestedLocale(req, res);
  if (!locale) return;
  const tenantId = req.currentTenant!.id;
  const { headers, rows } = await buildExport(entity, tenantId);
  const report = toReport(
    entity,
    headers,
    rows,
    locale,
    req.currentTenant!.name,
    format,
  );
  const exported = format === "pdf"
    ? await renderPdf(report, { locale, direction: locale === "ar" ? "rtl" : "ltr" })
    : await renderXlsx(report, { locale, direction: locale === "ar" ? "rtl" : "ltr" });

  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "data_export",
    entityType: entity,
    summary: `تصدير بيانات ${entity} بصيغة ${format} (${rows.length} سجلًا)`,
    details: { entity, format, rowCount: rows.length },
  });
  res.setHeader("Content-Type", exported.contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
  res.send(exported.data);
}

router.get("/admin/export/:entity.pdf", async (req, res) => {
  await sendBinaryExport(req, res, "pdf");
});

router.get("/admin/export/:entity.xlsx", async (req, res) => {
  await sendBinaryExport(req, res, "xlsx");
});

export default router;
