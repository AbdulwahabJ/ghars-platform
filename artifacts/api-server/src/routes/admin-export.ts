import { Router, type IRouter } from "express";
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
import { EXPORT_ENTITIES, type ExportEntity } from "@workspace/shared";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { writeAudit } from "../lib/audit";
import { sendCsv, toCsv } from "../lib/csv";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/export", requireAuth, requireRole("ADMIN"));

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : "");

/**
 * Complete operational data export — one CSV per entity. User references are
 * exported as display names; password hashes, sessions, tokens and secrets
 * are never part of any export.
 */
async function buildExport(
  entity: ExportEntity,
): Promise<{ headers: string[]; rows: unknown[][] }> {
  switch (entity) {
    default:
      throw new Error(`unknown export entity: ${entity as string}`);
    case "patients": {
      const rows = await db
        .select()
        .from(patientsTable)
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
  const { headers, rows } = await buildExport(entity);
  await writeAudit({
    userId: req.currentUser!.id,
    action: "data_export",
    entityType: entity,
    summary: `تصدير بيانات ${entity} (${rows.length} سجلًا)`,
    details: { entity, rowCount: rows.length },
  });
  sendCsv(res, `${entity}.csv`, toCsv(headers, rows));
});

export default router;
