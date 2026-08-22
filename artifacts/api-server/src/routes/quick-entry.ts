import { Router, type IRouter } from "express";
import { eq, and, isNull, notInArray } from "drizzle-orm";
import {
  db,
  patientsTable,
  implantCasesTable,
  implantsTable,
  paymentsTable,
  followupsTable,
  type ImplantRow,
  type PaymentRow,
  type FollowupRow,
} from "@workspace/db";
import {
  DUPLICATE_ACTIVE,
  DUPLICATE_ARCHIVED,
  REIMPLANTABLE_STATUSES,
  FORBIDDEN_FINANCIAL,
  normalizeArabicSearchText,
  normalizeMobile,
  quickEntryInputSchema,
  toEnglishDigits,
  type ImplantCase,
  type Implant,
  type Patient,
  type Payment,
  type Followup,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { effectivePermissions } from "../lib/permissions";
import { parseOrRespond } from "../lib/validation";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.post("/quick-entry", requireAuth, async (req, res) => {
  const input = parseOrRespond(quickEntryInputSchema, req.body, res);
  if (!input) return;

  const user = req.currentUser!;
  const perms = effectivePermissions(user);

  // Validate financial permissions before touching the DB
  if (
    typeof input.baseTreatmentAmount === "number" &&
    input.baseTreatmentAmount > 0 &&
    user.role !== "ADMIN" &&
    !perms.canViewFinancials
  ) {
    res.status(403).json({
      error: "ليست لديك صلاحية تعديل المبلغ المالي للحالة.",
      code: FORBIDDEN_FINANCIAL,
    });
    return;
  }
  if (input.initialPayment && user.role !== "ADMIN" && !perms.canRecordPayments) {
    res.status(403).json({
      error: "ليست لديك صلاحية تسجيل الدفعات.",
      code: FORBIDDEN_FINANCIAL,
    });
    return;
  }

  // Canonicalize file number
  const fileNumber = toEnglishDigits(input.patient.fileNumber).trim();

  // Normalize mobile if provided
  let mobileNormalized: string | null = null;
  if (input.patient.mobileNumber) {
    const mobileRes = normalizeMobile(input.patient.mobileNumber);
    if (!mobileRes.ok) {
      res.status(400).json({ error: mobileRes.message, code: "INVALID_MOBILE" });
      return;
    }
    mobileNormalized = mobileRes.normalized;
  }

  try {
    const result = await db.transaction(async (tx) => {
      // --- 1. Duplicate file-number check ---
      const [existing] = await tx
        .select({ id: patientsTable.id, archivedAt: patientsTable.archivedAt })
        .from(patientsTable)
        .where(eq(patientsTable.fileNumber, fileNumber))
        .limit(1);

      if (existing) {
        const code = existing.archivedAt ? DUPLICATE_ARCHIVED : DUPLICATE_ACTIVE;
        const error = existing.archivedAt
          ? "رقم الملف يعود لمريض مؤرشف."
          : "هذا المريض مسجل مسبقًا.";
        // Throw a typed object so the catch block can inspect it
        throw { __quick_entry_conflict: true, code, error, patientId: existing.id };
      }

      // --- 2. Create patient ---
      const [patientRow] = await tx
        .insert(patientsTable)
        .values({
          fileNumber,
          fullName: input.patient.fullName,
          fullNameNormalized: normalizeArabicSearchText(input.patient.fullName),
          mobileNumber: input.patient.mobileNumber ?? null,
          mobileNormalized,
          age: input.patient.age ?? null,
          administrativeNote: input.patient.administrativeNote ?? null,
        })
        .returning();

      await writeAudit(
        {
          userId: user.id,
          action: "patient_create",
          entityType: "patient",
          entityId: patientRow.id,
          summary: `تسجيل مريض جديد ${patientRow.fullName} (${patientRow.fileNumber}) عبر الإدخال السريع`,
        },
        tx,
      );

      if (!input.case) {
        // Patient only — done
        return { patientRow, caseRow: null, implantRows: [], paymentRow: null, followupRow: null };
      }

      // --- 3. Create implant case ---
      const [caseRow] = await tx
        .insert(implantCasesTable)
        .values({
          patientId: patientRow.id,
          procedureDate: input.case.procedureDate ?? null,
          treatingDoctor: input.case.treatingDoctor,
          referringDoctor: input.case.referringDoctor ?? null,
          caseStatus: input.case.caseStatus,
          prosValue: input.case.prosValue ?? null,
          expectedProstheticDate: input.case.expectedProstheticDate ?? null,
          generalNote: input.case.generalNote ?? null,
          legacyCostNote: input.case.legacyCostNote ?? null,
          isReimplantation: input.case.isReimplantation,
          reimplantationReason: input.case.reimplantationReason ?? null,
          sourceCaseId: null,
        })
        .returning();

      await writeAudit(
        {
          userId: user.id,
          action: "implant_case_create",
          entityType: "implant_case",
          entityId: caseRow.id,
          summary: `إضافة حالة زراعة للمريض ${patientRow.fullName} عبر الإدخال السريع`,
        },
        tx,
      );

      // --- 4. Base treatment amount (if provided) ---
      if (typeof input.baseTreatmentAmount === "number" && input.baseTreatmentAmount > 0) {
        await tx
          .update(implantCasesTable)
          .set({ baseTreatmentAmount: input.baseTreatmentAmount.toFixed(2) })
          .where(eq(implantCasesTable.id, caseRow.id));

        await writeAudit(
          {
            userId: user.id,
            action: "case_base_amount_update",
            entityType: "implant_case",
            entityId: caseRow.id,
            summary: `تحديث مبلغ العلاج الأساسي: ${input.baseTreatmentAmount} ر.س`,
          },
          tx,
        );
      }

      // --- 5. Implants ---
      const implantRows: ImplantRow[] = [];
      const seenSites = new Set<string>();

      for (const implantInput of input.implants) {
        const site = implantInput.site;

        // Check in-batch duplicates
        if (seenSites.has(site)) {
          throw {
            __quick_entry_conflict: true,
            code: "DUPLICATE_SITE",
            error: `موقع الزرعة ${site} مكرر في نفس الإدخال.`,
          };
        }
        seenSites.add(site);

        // Check DB duplicates (shouldn't happen for a brand new case, but be safe)
        const active = await tx
          .select({ id: implantsTable.id })
          .from(implantsTable)
          .where(
            and(
              eq(implantsTable.implantCaseId, caseRow.id),
              eq(implantsTable.site, site),
              isNull(implantsTable.archivedAt),
              notInArray(implantsTable.implantStatus, [...REIMPLANTABLE_STATUSES]),
            ),
          )
          .limit(1);

        if (active.length > 0) {
          throw {
            __quick_entry_conflict: true,
            code: "DUPLICATE_SITE",
            error: `موقع الزرعة ${site} مستخدم مسبقًا في هذه الحالة.`,
          };
        }

        const [implantRow] = await tx
          .insert(implantsTable)
          .values({
            implantCaseId: caseRow.id,
            site,
            isCustomSite: false,
            system: implantInput.system ?? null,
            diameter: implantInput.diameter != null ? String(implantInput.diameter) : null,
            length: implantInput.length != null ? String(implantInput.length) : null,
            qValue: implantInput.qValue ?? null,
            formerValue: implantInput.formerValue ?? null,
            graftValue: implantInput.graftValue ?? null,
            graftProcedureType: implantInput.graftProcedureType ?? null,
            graftNote: implantInput.graftNote ?? null,
            procedureTags: implantInput.procedureTags,
            implantStatus: implantInput.implantStatus,
            implantNote: implantInput.implantNote ?? null,
          })
          .returning();

        implantRows.push(implantRow);

        await writeAudit(
          {
            userId: user.id,
            action: "implant_create",
            entityType: "implant",
            entityId: implantRow.id,
            summary: `إضافة زرعة موقع ${site} للمريض ${patientRow.fullName}`,
          },
          tx,
        );
      }

      // --- 6. Initial payment ---
      let paymentRow: PaymentRow | null = null;
      if (input.initialPayment) {
        const [pr] = await tx
          .insert(paymentsTable)
          .values({
            implantCaseId: caseRow.id,
            amount: input.initialPayment.amount.toFixed(2),
            paymentDate: input.initialPayment.paymentDate,
            paymentLabel: input.initialPayment.paymentLabel,
            paymentMethod: input.initialPayment.paymentMethod,
            referenceNumber: input.initialPayment.referenceNumber ?? null,
            note: input.initialPayment.note ?? null,
            createdBy: user.id,
          })
          .returning();

        paymentRow = pr;

        await writeAudit(
          {
            userId: user.id,
            action: "payment_create",
            entityType: "payment",
            entityId: pr.id,
            summary: `تسجيل دفعة ${input.initialPayment.amount} ر.س للمريض ${patientRow.fullName}`,
          },
          tx,
        );
      }

      // --- 7. Initial follow-up ---
      let followupRow: FollowupRow | null = null;
      if (input.followup) {
        const [fr] = await tx
          .insert(followupsTable)
          .values({
            implantCaseId: caseRow.id,
            patientId: patientRow.id,
            followupType: input.followup.followupType,
            followupStatus: "مجدولة",
            scheduledAt: input.followup.scheduledAt ? new Date(input.followup.scheduledAt) : null,
            requiresContact: input.followup.requiresContact,
            contactDueAt: input.followup.contactDueAt ? new Date(input.followup.contactDueAt) : null,
            nextAppointmentAt: input.followup.nextAppointmentAt ? new Date(input.followup.nextAppointmentAt) : null,
            note: input.followup.note ?? null,
            // Quick-entry follow-ups are owned by the authenticated user.
            assignedUserId: user.id,
            createdBy: user.id,
          })
          .returning();

        followupRow = fr;

        await writeAudit(
          {
            userId: user.id,
            action: "followup_created",
            entityType: "followup",
            entityId: fr.id,
            summary: `إضافة متابعة ${input.followup.followupType} للمريض ${patientRow.fullName}`,
          },
          tx,
        );
      }

      return { patientRow, caseRow, implantRows, paymentRow, followupRow };
    });

    // Build response DTOs
    const patient: Patient = {
      id: result.patientRow.id,
      fileNumber: result.patientRow.fileNumber,
      fullName: result.patientRow.fullName,
      mobileNumber: result.patientRow.mobileNumber,
      mobileNormalized: result.patientRow.mobileNormalized,
      age: result.patientRow.age,
      administrativeNote: result.patientRow.administrativeNote,
      status: "active",
      createdAt: result.patientRow.createdAt.toISOString(),
      updatedAt: result.patientRow.updatedAt.toISOString(),
      archivedAt: null,
    };

    const caseDto: ImplantCase | undefined = result.caseRow
      ? {
          id: result.caseRow.id,
          patientId: result.caseRow.patientId,
          procedureDate: result.caseRow.procedureDate ?? null,
          treatingDoctor: result.caseRow.treatingDoctor,
          referringDoctor: result.caseRow.referringDoctor,
          caseStatus: result.caseRow.caseStatus as ImplantCase["caseStatus"],
          prosValue: result.caseRow.prosValue,
          expectedProstheticDate: result.caseRow.expectedProstheticDate ?? null,
          generalNote: result.caseRow.generalNote,
          legacyCostNote: result.caseRow.legacyCostNote,
          isReimplantation: result.caseRow.isReimplantation,
          reimplantationReason: result.caseRow.reimplantationReason,
          sourceCaseId: result.caseRow.sourceCaseId,
          status: result.caseRow.archivedAt ? "archived" : "active",
          createdAt: result.caseRow.createdAt.toISOString(),
          updatedAt: result.caseRow.updatedAt.toISOString(),
          archivedAt: result.caseRow.archivedAt?.toISOString() ?? null,
        }
      : undefined;

    const implants: Implant[] = result.implantRows.map((row) => ({
      id: row.id,
      implantCaseId: row.implantCaseId,
      site: row.site,
      isCustomSite: row.isCustomSite,
      system: row.system,
      diameter: row.diameter != null ? Number(row.diameter) : null,
      length: row.length != null ? Number(row.length) : null,
      qValue: row.qValue,
      formerValue: row.formerValue,
      graftValue: row.graftValue,
      graftProcedureType: row.graftProcedureType,
      graftNote: row.graftNote,
      procedureTags: row.procedureTags ?? [],
      implantStatus: row.implantStatus as Implant["implantStatus"],
      implantNote: row.implantNote,
      status: row.archivedAt ? "archived" : "active",
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      archivedAt: row.archivedAt?.toISOString() ?? null,
    }));

    const paymentDto: Payment | undefined = result.paymentRow
      ? {
          id: result.paymentRow.id,
          implantCaseId: result.paymentRow.implantCaseId,
          installmentId: null,
          amount: Number(result.paymentRow.amount),
          paymentDate: result.paymentRow.paymentDate,
          paymentLabel: result.paymentRow.paymentLabel,
          paymentMethod: result.paymentRow.paymentMethod,
          referenceNumber: result.paymentRow.referenceNumber,
          note: result.paymentRow.note,
          createdByName: null,
          createdAt: result.paymentRow.createdAt.toISOString(),
          isVoided: false,
          voidedAt: null,
          voidedByName: null,
          voidReason: null,
        }
      : undefined;

    const followupDto: Followup | undefined = result.followupRow
      ? {
          id: result.followupRow.id,
          implantCaseId: result.followupRow.implantCaseId,
          patientId: result.followupRow.patientId,
          followupType: result.followupRow.followupType,
          followupStatus: result.followupRow.followupStatus,
          scheduledAt: result.followupRow.scheduledAt?.toISOString() ?? null,
          result: result.followupRow.result,
          note: result.followupRow.note,
          requiresContact: result.followupRow.requiresContact,
          contactDueAt: result.followupRow.contactDueAt?.toISOString() ?? null,
          nextAppointmentAt: result.followupRow.nextAppointmentAt?.toISOString() ?? null,
          assignedUserId: result.followupRow.assignedUserId,
          assignedUserName: null,
          createdByName: null,
          createdAt: result.followupRow.createdAt.toISOString(),
          updatedAt: result.followupRow.updatedAt.toISOString(),
        }
      : undefined;

    res.status(201).json({
      patient,
      case: caseDto,
      implants,
      payment: paymentDto,
      followup: followupDto,
    });
  } catch (err) {
    // Typed conflict thrown from the transaction
    if (
      err &&
      typeof err === "object" &&
      "__quick_entry_conflict" in err
    ) {
      const conflict = err as unknown as { code: string; error: string; patientId?: string };
      const status = conflict.code === "DUPLICATE_ACTIVE" || conflict.code === "DUPLICATE_ARCHIVED" ? 409 : 400;
      res.status(status).json({
        error: conflict.error,
        code: conflict.code,
        patientId: conflict.patientId,
      });
      return;
    }
    throw err;
  }
});

export default router;
