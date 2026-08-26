import { Router, type IRouter } from "express";
import type { NextFunction, Request, Response } from "express";
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from "drizzle-orm";
import {
  caseChargesTable,
  caseDiscountsTable,
  db,
  implantCasesTable,
  installmentPlansTable,
  installmentsTable,
  implantsTable,
  patientsTable,
  paymentsTable,
  usersTable,
  tenantMembershipsTable,
  type CaseChargeRow,
  type CaseDiscountRow,
  type ImplantCaseRow,
  type InstallmentPlanRow,
  type InstallmentRow,
  type PaymentRow,
} from "@workspace/db";
import {
  CASE_ARCHIVED,
  CHARGE_IMPLANT_INVALID,
  CHARGE_NOT_FOUND,
  DISCOUNT_NOT_FOUND,
  FORBIDDEN_FINANCIAL,
  PATIENT_ARCHIVED,
  PAYMENT_ALREADY_VOIDED,
  PAYMENT_NOT_FOUND,
  baseAmountInputSchema,
  addCalendarMonths,
  calcPaymentStatus,
  caseFinanceSummarySchema,
  chargeInputSchema,
  discountInputSchema,
  installmentPlanInputSchema,
  splitInstallmentAmount,
  financeFiltersSchema,
  paymentInputSchema,
  paymentUpdateSchema,
  toCents,
  voidPaymentInputSchema,
  type CaseFinanceResponse,
  type CaseFinanceSummary,
  type Charge,
  type Discount,
  type FinanceOverview,
  type FinancePaymentRow,
  type InstallmentPlan,
  type Installment,
  type Payment,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { effectivePermissions } from "../lib/permissions";
import { parseOrRespond } from "../lib/validation";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/implant-cases", requireAuth);
router.use("/payments", requireAuth);
router.use("/charges", requireAuth);
router.use("/discounts", requireAuth);
router.use("/finance", requireAuth);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_NOT_FOUND_BODY = {
  error: "حالة الزراعة غير موجودة.",
  code: "CASE_NOT_FOUND",
};
const CASE_ARCHIVED_BODY = {
  error: "حالة الزراعة مؤرشفة. قم باستعادتها أولًا قبل التعديل.",
  code: CASE_ARCHIVED,
};
const PATIENT_ARCHIVED_BODY = {
  error: "ملف المريض مؤرشف ولا يمكن تعديل بياناته. قم باستعادة الملف أولًا.",
  code: PATIENT_ARCHIVED,
};
const FORBIDDEN_FINANCIAL_BODY = {
  error: "ليست لديك صلاحية الوصول إلى البيانات المالية.",
  code: FORBIDDEN_FINANCIAL,
};

/* ------------------------------------------------------------------ */
/* Permission middlewares (backend enforcement, never UI-only)          */
/* ------------------------------------------------------------------ */

/** Full financial access: ADMIN, or any user with the view permission. */
function requireFinanceView(req: Request, res: Response, next: NextFunction) {
  const membership = req.currentMembership!;
  if (membership.role === "ADMIN" || effectivePermissions(membership).canViewFinancials) {
    next();
    return;
  }
  res.status(403).json(FORBIDDEN_FINANCIAL_BODY);
}

/** Case-level finance read: view permission OR payment-recording permission. */
function requireCaseFinanceRead(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const membership = req.currentMembership!;
  const perms = effectivePermissions(membership);
  if (membership.role === "ADMIN" || perms.canViewFinancials || perms.canRecordPayments) {
    next();
    return;
  }
  res.status(403).json(FORBIDDEN_FINANCIAL_BODY);
}

/** Recording payments: ADMIN, or the explicit payment-recording permission. */
function requireRecordPayments(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const membership = req.currentMembership!;
  if (membership.role === "ADMIN" || effectivePermissions(membership).canRecordPayments) {
    next();
    return;
  }
  res.status(403).json({
    error: "ليست لديك صلاحية تسجيل الدفعات.",
    code: FORBIDDEN_FINANCIAL,
  });
}

/**
 * Managing financial records (base amount, charges, discounts, voiding):
 * ADMIN always; DOCTOR only with the financial-visibility permission.
 * ASSISTANT never gains this from the payment-recording permission.
 */
function requireFinanceManage(req: Request, res: Response, next: NextFunction) {
  const membership = req.currentMembership!;
  const allowed =
    membership.role === "ADMIN" ||
    (membership.role === "DOCTOR" &&
      effectivePermissions(membership).canViewFinancials);
  if (allowed) {
    next();
    return;
  }
  res.status(403).json(FORBIDDEN_FINANCIAL_BODY);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function findCase(id: string, tenantId: string): Promise<ImplantCaseRow | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(implantCasesTable)
    .where(and(eq(implantCasesTable.id, id), eq(implantCasesTable.tenantId, tenantId)))
    .limit(1);
  return row;
}

async function isPatientArchived(patientId: string, tenantId: string): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: patientsTable.archivedAt })
    .from(patientsTable)
    .where(and(eq(patientsTable.id, patientId), eq(patientsTable.tenantId, tenantId)))
    .limit(1);
  return Boolean(row?.archivedAt);
}

/** Blocks financial writes on archived cases or archived patient files. */
async function guardWritableCase(
  caseId: string,
  tenantId: string,
  res: Response,
): Promise<ImplantCaseRow | undefined> {
  const row = await findCase(caseId, tenantId);
  if (!row) {
    res.status(404).json(CASE_NOT_FOUND_BODY);
    return undefined;
  }
  if (row.archivedAt) {
    res.status(409).json(CASE_ARCHIVED_BODY);
    return undefined;
  }
  if (await isPatientArchived(row.patientId, tenantId)) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return undefined;
  }
  return row;
}

/** Batch-resolve user full names for DTO display fields. */
async function userNames(ids: Array<string | null>, tenantId: string): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName })
    .from(usersTable)
    .innerJoin(
      tenantMembershipsTable,
      and(
        eq(tenantMembershipsTable.userId, usersTable.id),
        eq(tenantMembershipsTable.tenantId, tenantId),
        eq(tenantMembershipsTable.isActive, true),
      ),
    )
    .where(and(inArray(usersTable.id, unique), eq(usersTable.isActive, true)));
  return new Map(rows.map((r) => [r.id, r.fullName]));
}

const money = (v: string | number | null | undefined): number =>
  v == null ? 0 : Math.round(Number(v) * 100) / 100;

function toChargeDto(
  row: CaseChargeRow,
  names: Map<string, string>,
  sites: Map<string, string>,
): Charge {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    implantId: row.implantId,
    implantSite: row.implantId ? (sites.get(row.implantId) ?? null) : null,
    chargeType: row.chargeType,
    description: row.description,
    amount: money(row.amount),
    chargeDate: row.chargeDate,
    note: row.note,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toDiscountDto(row: CaseDiscountRow, names: Map<string, string>): Discount {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    amount: money(row.amount),
    discountDate: row.discountDate,
    reason: row.reason,
    approvedByName: row.approvedBy ? (names.get(row.approvedBy) ?? null) : null,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

function toPaymentDto(row: PaymentRow, names: Map<string, string>): Payment {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    installmentId: row.installmentId,
    amount: money(row.amount),
    paymentDate: row.paymentDate,
    paymentLabel: row.paymentLabel,
    paymentMethod: row.paymentMethod,
    referenceNumber: row.referenceNumber,
    note: row.note,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    isVoided: Boolean(row.voidedAt),
    voidedAt: row.voidedAt?.toISOString() ?? null,
    voidedByName: row.voidedBy ? (names.get(row.voidedBy) ?? null) : null,
    voidReason: row.voidReason,
  };
}

function installmentStatus(args: {
  amountCents: number;
  paidCents: number;
  dueDate: string;
  today: string;
}): Installment["status"] {
  if (args.paidCents >= args.amountCents) return "مدفوع";
  if (args.paidCents > 0) return "مدفوع جزئيًا";
  if (args.dueDate < args.today) return "متأخر";
  if (args.dueDate === args.today) return "مستحق اليوم";
  return "مجدول";
}

function buildInstallmentPlanDto(args: {
  plan: InstallmentPlanRow;
  installments: InstallmentRow[];
  payments: PaymentRow[];
}): InstallmentPlan {
  const paidByInstallment = new Map<string, number>();
  for (const payment of args.payments) {
    if (!payment.installmentId || payment.voidedAt) continue;
    paidByInstallment.set(
      payment.installmentId,
      (paidByInstallment.get(payment.installmentId) ?? 0) +
        toCents(money(payment.amount)),
    );
  }
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
  }).format(new Date());
  return {
    id: args.plan.id,
    implantCaseId: args.plan.implantCaseId,
    totalAmount: money(args.plan.totalAmount),
    installmentCount: args.plan.installmentCount,
    firstDueDate: args.plan.firstDueDate,
    installments: args.installments
      .sort((a, b) => a.sequence - b.sequence)
      .map((row) => {
        const amountCents = toCents(money(row.amount));
        const paidCents = paidByInstallment.get(row.id) ?? 0;
        return {
          id: row.id,
          planId: row.planId,
          sequence: row.sequence,
          dueDate: row.dueDate,
          amount: amountCents / 100,
          paidAmount: paidCents / 100,
          outstanding: (amountCents - paidCents) / 100,
          status: installmentStatus({
            amountCents,
            paidCents,
            dueDate: row.dueDate,
            today,
          }),
        };
      }),
  };
}

function buildSummary(args: {
  implantCaseId: string;
  caseStatus: string;
  baseTreatmentAmount: number;
  chargesTotal: number;
  discountsTotal: number;
  paidAmount: number;
}): CaseFinanceSummary {
  const baseCents = toCents(args.baseTreatmentAmount);
  const chargesCents = toCents(args.chargesTotal);
  const discountsCents = toCents(args.discountsTotal);
  const paidCents = toCents(args.paidAmount);
  const finalCents = baseCents + chargesCents - discountsCents;
  const outstandingCents = finalCents - paidCents;
  const summary: CaseFinanceSummary = {
    implantCaseId: args.implantCaseId,
    baseTreatmentAmount: baseCents / 100,
    chargesTotal: chargesCents / 100,
    discountsTotal: discountsCents / 100,
    finalTotal: finalCents / 100,
    paidAmount: paidCents / 100,
    outstanding: outstandingCents / 100,
    paymentPercent:
      finalCents > 0 ? Math.round((paidCents / finalCents) * 1000) / 10 : null,
    paymentStatus: calcPaymentStatus({
      finalTotalCents: finalCents,
      paidCents,
      caseStatus: args.caseStatus,
    }),
    isOverpaid: paidCents > 0 && paidCents > finalCents,
  };
  return caseFinanceSummarySchema.parse(summary);
}

/* ------------------------------------------------------------------ */
/* Case finance (summary + records)                                    */
/* ------------------------------------------------------------------ */

router.get(
  "/implant-cases/:id/finance",
  requireCaseFinanceRead,
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const caseRow = await findCase(String(req.params.id), tenantId);
    if (!caseRow) {
      res.status(404).json(CASE_NOT_FOUND_BODY);
      return;
    }

    const [charges, discounts, payments, implants, plans] = await Promise.all([
      db
        .select()
        .from(caseChargesTable)
        .where(and(eq(caseChargesTable.implantCaseId, caseRow.id), eq(caseChargesTable.tenantId, tenantId)))
        .orderBy(asc(caseChargesTable.chargeDate), asc(caseChargesTable.createdAt)),
      db
        .select()
        .from(caseDiscountsTable)
        .where(and(eq(caseDiscountsTable.implantCaseId, caseRow.id), eq(caseDiscountsTable.tenantId, tenantId)))
        .orderBy(asc(caseDiscountsTable.discountDate), asc(caseDiscountsTable.createdAt)),
      db
        .select()
        .from(paymentsTable)
        .where(and(eq(paymentsTable.implantCaseId, caseRow.id), eq(paymentsTable.tenantId, tenantId)))
        .orderBy(asc(paymentsTable.paymentDate), asc(paymentsTable.createdAt)),
      db
        .select({ id: implantsTable.id, site: implantsTable.site })
        .from(implantsTable)
        .where(and(eq(implantsTable.implantCaseId, caseRow.id), eq(implantsTable.tenantId, tenantId))),
      db
        .select()
        .from(installmentPlansTable)
        .where(and(eq(installmentPlansTable.implantCaseId, caseRow.id), eq(installmentPlansTable.tenantId, tenantId)))
        .limit(1),
    ]);
    const plan = plans[0] ?? null;
    const installments = plan
      ? await db
          .select()
          .from(installmentsTable)
          .where(and(eq(installmentsTable.planId, plan.id), eq(installmentsTable.tenantId, tenantId)))
          .orderBy(asc(installmentsTable.sequence))
      : [];

    const names = await userNames([
      ...charges.map((c) => c.createdBy),
      ...discounts.flatMap((d) => [d.createdBy, d.approvedBy]),
      ...payments.flatMap((p) => [p.createdBy, p.voidedBy]),
    ], tenantId);
    const sites = new Map(implants.map((i) => [i.id, i.site]));

    const chargesTotal = charges.reduce((s, c) => s + toCents(money(c.amount)), 0);
    const discountsTotal = discounts.reduce((s, d) => s + toCents(money(d.amount)), 0);
    const paidAmount = payments
      .filter((p) => !p.voidedAt)
      .reduce((s, p) => s + toCents(money(p.amount)), 0);

    const body: CaseFinanceResponse = {
      summary: buildSummary({
        implantCaseId: caseRow.id,
        caseStatus: caseRow.caseStatus,
        baseTreatmentAmount: money(caseRow.baseTreatmentAmount),
        chargesTotal: chargesTotal / 100,
        discountsTotal: discountsTotal / 100,
        paidAmount: paidAmount / 100,
      }),
      installmentPlan: plan
        ? buildInstallmentPlanDto({ plan, installments, payments })
        : null,
      charges: charges.map((c) => toChargeDto(c, names, sites)),
      discounts: discounts.map((d) => toDiscountDto(d, names)),
      payments: payments.map((p) => toPaymentDto(p, names)),
    };
    res.json(body);
  },
);

/* ------------------------------------------------------------------ */
/* Installment plan — scheduling only; payments remain the ledger      */
/* ------------------------------------------------------------------ */

router.put(
  "/implant-cases/:id/installment-plan",
  requireFinanceManage,
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const caseRow = await guardWritableCase(String(req.params.id), tenantId, res);
    if (!caseRow) return;
    const input = parseOrRespond(installmentPlanInputSchema, req.body, res);
    if (!input) return;

    const [charges, discounts, existingPlan] = await Promise.all([
      db
        .select({ amount: caseChargesTable.amount })
        .from(caseChargesTable)
        .where(and(eq(caseChargesTable.implantCaseId, caseRow.id), eq(caseChargesTable.tenantId, tenantId))),
      db
        .select({ amount: caseDiscountsTable.amount })
        .from(caseDiscountsTable)
        .where(and(eq(caseDiscountsTable.implantCaseId, caseRow.id), eq(caseDiscountsTable.tenantId, tenantId))),
      db
        .select()
        .from(installmentPlansTable)
        .where(and(eq(installmentPlansTable.implantCaseId, caseRow.id), eq(installmentPlansTable.tenantId, tenantId)))
        .limit(1),
    ]);
    const finalCents =
      toCents(money(caseRow.baseTreatmentAmount)) +
      charges.reduce((sum, row) => sum + toCents(money(row.amount)), 0) -
      discounts.reduce((sum, row) => sum + toCents(money(row.amount)), 0);
    if (toCents(input.totalAmount) > finalCents) {
      res.status(400).json({
        error: "المبلغ المجدول لا يمكن أن يتجاوز الإجمالي النهائي للحالة.",
        code: "INSTALLMENT_TOTAL_EXCEEDS_FINAL",
      });
      return;
    }

    const amounts = splitInstallmentAmount(
      input.totalAmount,
      input.installmentCount,
    );
    const dates = amounts.map((_, index) =>
      addCalendarMonths(input.firstDueDate, index),
    );
    const currentPlan = existingPlan[0] ?? null;
    const existingInstallments = currentPlan
      ? await db
          .select()
          .from(installmentsTable)
          .where(and(eq(installmentsTable.planId, currentPlan.id), eq(installmentsTable.tenantId, tenantId)))
          .orderBy(asc(installmentsTable.sequence))
      : [];
    const linkedPayments =
      existingInstallments.length > 0
        ? await db
            .select()
            .from(paymentsTable)
            .where(
              and(
                inArray(
                  paymentsTable.installmentId,
                  existingInstallments.map((installment) => installment.id),
                ),
                eq(paymentsTable.tenantId, tenantId),
              ),
            )
        : [];
    const activePayments = linkedPayments.filter((payment) => !payment.voidedAt);

    if (
      linkedPayments.length > 0 &&
      existingInstallments.length !== input.installmentCount
    ) {
      res.status(409).json({
        error:
          "لا يمكن تغيير عدد الأقساط بعد ربط دفعات بها. حدّث الجدول مع الحفاظ على العدد الحالي.",
        code: "INSTALLMENT_COUNT_LOCKED",
      });
      return;
    }

    const paidByInstallment = new Map<string, number>();
    for (const payment of activePayments) {
      if (!payment.installmentId) continue;
      paidByInstallment.set(
        payment.installmentId,
        (paidByInstallment.get(payment.installmentId) ?? 0) +
          toCents(money(payment.amount)),
      );
    }
    const isAmountBelowPaid = existingInstallments.some(
      (installment, index) =>
        (paidByInstallment.get(installment.id) ?? 0) >
        toCents(amounts[index] ?? 0),
    );
    if (isAmountBelowPaid) {
      res.status(409).json({
        error: "لا يمكن جعل مبلغ القسط أقل من الدفعات المسجلة عليه.",
        code: "INSTALLMENT_AMOUNT_BELOW_PAID",
      });
      return;
    }

    let plan: InstallmentPlanRow;
    let installments: InstallmentRow[];
    if (currentPlan) {
      [plan] = await db
        .update(installmentPlansTable)
        .set({
          totalAmount: input.totalAmount.toFixed(2),
          installmentCount: input.installmentCount,
          firstDueDate: input.firstDueDate,
          updatedBy: req.currentUser!.id,
          updatedAt: new Date(),
        })
        .where(and(eq(installmentPlansTable.id, currentPlan.id), eq(installmentPlansTable.tenantId, tenantId)))
        .returning();
      if (existingInstallments.length === 0 || linkedPayments.length === 0) {
        if (existingInstallments.length) {
          await db
            .delete(installmentsTable)
            .where(and(eq(installmentsTable.planId, plan.id), eq(installmentsTable.tenantId, tenantId)));
        }
        installments = await db
          .insert(installmentsTable)
          .values(
            amounts.map((amount, index) => ({
              tenantId,
              planId: plan.id,
              sequence: index + 1,
              dueDate: dates[index],
              amount: amount.toFixed(2),
            })),
          )
          .returning();
      } else {
        installments = await Promise.all(
          existingInstallments.map((installment, index) =>
            db
              .update(installmentsTable)
              .set({
                dueDate: dates[index],
                amount: amounts[index].toFixed(2),
                updatedAt: new Date(),
              })
              .where(and(eq(installmentsTable.id, installment.id), eq(installmentsTable.tenantId, tenantId)))
              .returning()
              .then(([row]) => row),
          ),
        );
      }
    } else {
      [plan] = await db
        .insert(installmentPlansTable)
        .values({
          tenantId,
          implantCaseId: caseRow.id,
          totalAmount: input.totalAmount.toFixed(2),
          installmentCount: input.installmentCount,
          firstDueDate: input.firstDueDate,
          createdBy: req.currentUser!.id,
          updatedBy: req.currentUser!.id,
        })
        .returning();
      installments = await db
        .insert(installmentsTable)
        .values(
          amounts.map((amount, index) => ({
              tenantId,
            planId: plan.id,
            sequence: index + 1,
            dueDate: dates[index],
            amount: amount.toFixed(2),
          })),
        )
        .returning();
    }

    const allPayments = await db
      .select()
      .from(paymentsTable)
      .where(and(eq(paymentsTable.implantCaseId, caseRow.id), eq(paymentsTable.tenantId, tenantId)));
    await writeAudit({
      tenantId,
      userId: req.currentUser!.id,
      action: currentPlan ? "installment_plan_update" : "installment_plan_create",
      entityType: "installment_plan",
      entityId: plan.id,
      summary: `${currentPlan ? "تعديل" : "إنشاء"} خطة تقسيط من ${input.installmentCount} أقساط بإجمالي ${input.totalAmount.toFixed(2)}`,
      details: {
        totalAmount: input.totalAmount,
        installmentCount: input.installmentCount,
        firstDueDate: input.firstDueDate,
      },
    });
    res.json({
      installmentPlan: buildInstallmentPlanDto({
        plan,
        installments,
        payments: allPayments,
      }),
    });
  },
);

router.patch(
  "/implant-cases/:id/base-amount",
  requireFinanceManage,
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const caseRow = await guardWritableCase(String(req.params.id), tenantId, res);
    if (!caseRow) return;
    const input = parseOrRespond(baseAmountInputSchema, req.body, res);
    if (!input) return;

    const previous = money(caseRow.baseTreatmentAmount);
    await db
      .update(implantCasesTable)
      .set({
        baseTreatmentAmount: input.baseTreatmentAmount.toFixed(2),
        updatedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(and(eq(implantCasesTable.id, caseRow.id), eq(implantCasesTable.tenantId, tenantId)));

    await writeAudit({
      tenantId,
      userId: req.currentUser!.id,
      action: "case_base_amount_update",
      entityType: "implant_case",
      entityId: caseRow.id,
      summary: `تعديل قيمة العلاج الأساسية من ${previous.toFixed(2)} إلى ${input.baseTreatmentAmount.toFixed(2)}`,
      details: { previous, next: input.baseTreatmentAmount },
    });
    res.json({ baseTreatmentAmount: input.baseTreatmentAmount });
  },
);

/* ------------------------------------------------------------------ */
/* Charges                                                             */
/* ------------------------------------------------------------------ */

router.post(
  "/implant-cases/:id/charges",
  requireFinanceManage,
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const caseRow = await guardWritableCase(String(req.params.id), tenantId, res);
    if (!caseRow) return;
    const input = parseOrRespond(chargeInputSchema, req.body, res);
    if (!input) return;

    if (input.implantId) {
      const [implant] = await db
        .select({ id: implantsTable.id, implantCaseId: implantsTable.implantCaseId })
        .from(implantsTable)
        .where(and(eq(implantsTable.id, input.implantId), eq(implantsTable.tenantId, tenantId)))
        .limit(1);
      if (!implant || implant.implantCaseId !== caseRow.id) {
        res.status(400).json({
          error: "الزرعة المرتبطة لا تنتمي إلى نفس حالة الزراعة.",
          code: CHARGE_IMPLANT_INVALID,
        });
        return;
      }
    }

    const [row] = await db
      .insert(caseChargesTable)
      .values({
        tenantId,
        implantCaseId: caseRow.id,
        implantId: input.implantId,
        chargeType: input.chargeType,
        description: input.description,
        amount: input.amount.toFixed(2),
        chargeDate: input.chargeDate,
        note: input.note,
        createdBy: req.currentUser!.id,
      })
      .returning();

    await writeAudit({
      tenantId,
      userId: req.currentUser!.id,
      action: "charge_create",
      entityType: "case_charge",
      entityId: row.id,
      summary: `إضافة رسم (${row.chargeType}) بمبلغ ${money(row.amount).toFixed(2)}`,
    });
    const names = await userNames([row.createdBy], tenantId);
    const sites = row.implantId
      ? new Map(
          (
            await db
              .select({ id: implantsTable.id, site: implantsTable.site })
              .from(implantsTable)
              .where(and(eq(implantsTable.id, row.implantId), eq(implantsTable.tenantId, tenantId)))
          ).map((i) => [i.id, i.site]),
        )
      : new Map<string, string>();
    res.status(201).json({ charge: toChargeDto(row, names, sites) });
  },
);

router.delete("/charges/:id", requireFinanceManage, async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الرسم غير موجود.", code: CHARGE_NOT_FOUND });
    return;
  }
  const [existing] = await db
    .select()
    .from(caseChargesTable)
    .where(and(eq(caseChargesTable.id, id), eq(caseChargesTable.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "الرسم غير موجود.", code: CHARGE_NOT_FOUND });
    return;
  }
  const caseRow = await guardWritableCase(existing.implantCaseId, tenantId, res);
  if (!caseRow) return;

  await db.delete(caseChargesTable).where(and(eq(caseChargesTable.id, id), eq(caseChargesTable.tenantId, tenantId)));
  await writeAudit({
    tenantId: req.currentTenant!.id,
    userId: req.currentUser!.id,
    action: "charge_delete",
    entityType: "case_charge",
    entityId: id,
    summary: `حذف رسم (${existing.chargeType}) بمبلغ ${money(existing.amount).toFixed(2)}`,
    details: { charge: existing },
  });
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Discounts                                                           */
/* ------------------------------------------------------------------ */

router.post(
  "/implant-cases/:id/discounts",
  requireFinanceManage,
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const caseRow = await guardWritableCase(String(req.params.id), tenantId, res);
    if (!caseRow) return;
    const input = parseOrRespond(discountInputSchema, req.body, res);
    if (!input) return;

    const [row] = await db
      .insert(caseDiscountsTable)
      .values({
        tenantId,
        implantCaseId: caseRow.id,
        amount: input.amount.toFixed(2),
        discountDate: input.discountDate,
        reason: input.reason,
        approvedBy: req.currentUser!.id,
        createdBy: req.currentUser!.id,
      })
      .returning();

    await writeAudit({
      tenantId,
      userId: req.currentUser!.id,
      action: "discount_create",
      entityType: "case_discount",
      entityId: row.id,
      summary: `إضافة خصم بمبلغ ${money(row.amount).toFixed(2)}`,
      details: { reason: input.reason },
    });
    const names = await userNames([row.createdBy, row.approvedBy], tenantId);
    res.status(201).json({ discount: toDiscountDto(row, names) });
  },
);

router.delete("/discounts/:id", requireFinanceManage, async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الخصم غير موجود.", code: DISCOUNT_NOT_FOUND });
    return;
  }
  const [existing] = await db
    .select()
    .from(caseDiscountsTable)
    .where(and(eq(caseDiscountsTable.id, id), eq(caseDiscountsTable.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "الخصم غير موجود.", code: DISCOUNT_NOT_FOUND });
    return;
  }
  const caseRow = await guardWritableCase(existing.implantCaseId, tenantId, res);
  if (!caseRow) return;

  await db.delete(caseDiscountsTable).where(and(eq(caseDiscountsTable.id, id), eq(caseDiscountsTable.tenantId, tenantId)));
  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "discount_delete",
    entityType: "case_discount",
    entityId: id,
    summary: `حذف خصم بمبلغ ${money(existing.amount).toFixed(2)}`,
    details: { discount: existing },
  });
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Payments                                                            */
/* ------------------------------------------------------------------ */

router.post(
  "/implant-cases/:id/payments",
  requireRecordPayments,
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const caseRow = await guardWritableCase(String(req.params.id), tenantId, res);
    if (!caseRow) return;
    const input = parseOrRespond(paymentInputSchema, req.body, res);
    if (!input) return;
    if (input.installmentId) {
      const [installment] = await db
        .select({
          id: installmentsTable.id,
          amount: installmentsTable.amount,
          implantCaseId: installmentPlansTable.implantCaseId,
        })
        .from(installmentsTable)
        .innerJoin(
          installmentPlansTable,
          eq(installmentsTable.planId, installmentPlansTable.id),
        )
        .where(and(eq(installmentsTable.id, input.installmentId), eq(installmentsTable.tenantId, tenantId), eq(installmentPlansTable.tenantId, tenantId)))
        .limit(1);
      if (!installment || installment.implantCaseId !== caseRow.id) {
        res.status(400).json({
          error: "القسط المختار لا ينتمي إلى حالة الزراعة هذه.",
          code: "INSTALLMENT_INVALID",
        });
        return;
      }
      const linkedPayments = await db
        .select({ amount: paymentsTable.amount })
        .from(paymentsTable)
        .where(
          and(
            eq(paymentsTable.installmentId, installment.id),
            isNull(paymentsTable.voidedAt),
            eq(paymentsTable.tenantId, tenantId),
          ),
        );
      const alreadyPaid = linkedPayments.reduce(
        (sum, payment) => sum + toCents(money(payment.amount)),
        0,
      );
      if (alreadyPaid + toCents(input.amount) > toCents(money(installment.amount))) {
        res.status(409).json({
          error: "مبلغ الدفعة يتجاوز المتبقي من هذا القسط.",
          code: "INSTALLMENT_OVERPAYMENT",
        });
        return;
      }
    }

    const [row] = await db
      .insert(paymentsTable)
      .values({
        tenantId,
        implantCaseId: caseRow.id,
        installmentId: input.installmentId,
        amount: input.amount.toFixed(2),
        paymentDate: input.paymentDate,
        paymentLabel: input.paymentLabel,
        paymentMethod: input.paymentMethod,
        referenceNumber: input.referenceNumber,
        note: input.note,
        createdBy: req.currentUser!.id,
      })
      .returning();

    await writeAudit({
      tenantId,
      userId: req.currentUser!.id,
      action: "payment_create",
      entityType: "payment",
      entityId: row.id,
      summary: `تسجيل دفعة (${row.paymentLabel}) بمبلغ ${money(row.amount).toFixed(2)} — ${row.paymentMethod}`,
    });
    const names = await userNames([row.createdBy], tenantId);
    res.status(201).json({ payment: toPaymentDto(row, names) });
  },
);

router.patch("/payments/:id", requireFinanceManage, async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الدفعة غير موجودة.", code: PAYMENT_NOT_FOUND });
    return;
  }
  const [existing] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "الدفعة غير موجودة.", code: PAYMENT_NOT_FOUND });
    return;
  }
  if (existing.voidedAt) {
    res.status(409).json({ error: "لا يمكن تعديل دفعة ملغاة.", code: PAYMENT_ALREADY_VOIDED });
    return;
  }
  const input = parseOrRespond(paymentUpdateSchema, req.body, res);
  if (!input) return;

  const previous = {
    amount: money(existing.amount),
    paymentDate: existing.paymentDate,
    paymentLabel: existing.paymentLabel,
    paymentMethod: existing.paymentMethod,
    referenceNumber: existing.referenceNumber,
    note: existing.note,
  };

  const [row] = await db
    .update(paymentsTable)
    .set({
      ...(input.amount !== undefined && { amount: input.amount.toFixed(2) }),
      ...(input.paymentDate !== undefined && { paymentDate: input.paymentDate }),
      ...(input.paymentLabel !== undefined && { paymentLabel: input.paymentLabel }),
      ...(input.paymentMethod !== undefined && { paymentMethod: input.paymentMethod }),
      ...(input.referenceNumber !== undefined && { referenceNumber: input.referenceNumber }),
      ...(input.note !== undefined && { note: input.note }),
    })
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.tenantId, tenantId)))
    .returning();

  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "payment_update",
    entityType: "payment",
    entityId: id,
    summary: `تعديل دفعة — المبلغ السابق: ${previous.amount.toFixed(2)} ر.س، المبلغ الجديد: ${money(row.amount).toFixed(2)} ر.س`,
    details: { previous, next: input },
  });
  const names = await userNames([row.createdBy, row.voidedBy], tenantId);
  res.json({ payment: toPaymentDto(row, names) });
});

router.post("/payments/:id/void", requireFinanceManage, async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json({ error: "الدفعة غير موجودة.", code: PAYMENT_NOT_FOUND });
    return;
  }
  const [existing] = await db
    .select()
    .from(paymentsTable)
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    res.status(404).json({ error: "الدفعة غير موجودة.", code: PAYMENT_NOT_FOUND });
    return;
  }
  if (existing.voidedAt) {
    res.status(409).json({
      error: "الدفعة ملغاة بالفعل.",
      code: PAYMENT_ALREADY_VOIDED,
    });
    return;
  }
  const input = parseOrRespond(voidPaymentInputSchema, req.body, res);
  if (!input) return;

  const [row] = await db
    .update(paymentsTable)
    .set({
      voidedAt: new Date(),
      voidedBy: req.currentUser!.id,
      voidReason: input.reason,
    })
    .where(and(eq(paymentsTable.id, id), eq(paymentsTable.tenantId, tenantId), isNull(paymentsTable.voidedAt)))
    .returning();
  if (!row) {
    res.status(409).json({
      error: "الدفعة ملغاة بالفعل.",
      code: PAYMENT_ALREADY_VOIDED,
    });
    return;
  }

  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "payment_void",
    entityType: "payment",
    entityId: id,
    summary: `إلغاء دفعة بمبلغ ${money(row.amount).toFixed(2)} — السبب: ${input.reason}`,
    details: { reason: input.reason },
  });
  const names = await userNames([row.createdBy, row.voidedBy], tenantId);
  res.json({ payment: toPaymentDto(row, names) });
});

/* ------------------------------------------------------------------ */
/* Finance overview (page + export)                                    */
/* ------------------------------------------------------------------ */

interface CaseFinRow {
  id: string;
  patientId: string;
  caseStatus: string;
  valueDate: string;
  base: string | null;
  charges: string | null;
  discounts: string | null;
  paid: string | null;
}

/** Per-case aggregates for all non-archived cases of non-archived patients. */
export async function loadCaseFinancials(filters: {
  patientName?: string;
  fileNumber?: string;
  implantSystem?: string;
}, tenantId: string): Promise<Array<CaseFinRow & { finalCents: number; paidCents: number; status: string }>> {
  const rows = await db.execute(sql`
    SELECT
      ic.id,
      ic.patient_id AS "patientId",
      ic.case_status AS "caseStatus",
      COALESCE(ic.procedure_date::text, (ic.created_at AT TIME ZONE 'Asia/Riyadh')::date::text) AS "valueDate",
      ic.base_treatment_amount::text AS base,
      ch.total::text AS charges,
      d.total::text AS discounts,
      p.total::text AS paid
    FROM implant_cases ic
     JOIN patients pt ON pt.id = ic.patient_id AND pt.tenant_id = ${tenantId}
    LEFT JOIN (
       SELECT implant_case_id, SUM(amount) AS total FROM case_charges WHERE tenant_id = ${tenantId} GROUP BY implant_case_id
    ) ch ON ch.implant_case_id = ic.id
    LEFT JOIN (
       SELECT implant_case_id, SUM(amount) AS total FROM case_discounts WHERE tenant_id = ${tenantId} GROUP BY implant_case_id
    ) d ON d.implant_case_id = ic.id
    LEFT JOIN (
       SELECT implant_case_id, SUM(amount) AS total FROM payments WHERE voided_at IS NULL AND tenant_id = ${tenantId} GROUP BY implant_case_id
    ) p ON p.implant_case_id = ic.id
     WHERE ic.tenant_id = ${tenantId}
       AND ic.archived_at IS NULL
      AND pt.archived_at IS NULL
      ${filters.patientName ? sql`AND pt.full_name ILIKE ${"%" + filters.patientName + "%"}` : sql``}
      ${filters.fileNumber ? sql`AND pt.file_number = ${filters.fileNumber}` : sql``}
      ${
        filters.implantSystem
          ? sql`AND EXISTS (
              SELECT 1 FROM implants i
               WHERE i.implant_case_id = ic.id AND i.tenant_id = ${tenantId}
                AND i.archived_at IS NULL
                AND i.system = ${filters.implantSystem}
            )`
          : sql``
      }
  `);
  return (rows.rows as unknown as CaseFinRow[]).map((r) => {
    const finalCents =
      toCents(money(r.base)) + toCents(money(r.charges)) - toCents(money(r.discounts));
    const paidCents = toCents(money(r.paid));
    return {
      ...r,
      finalCents,
      paidCents,
      status: calcPaymentStatus({
        finalTotalCents: finalCents,
        paidCents,
        caseStatus: r.caseStatus,
      }),
    };
  });
}

async function computeOverview(
  filters: ReturnType<typeof financeFiltersSchema.parse>,
  tenantId: string,
): Promise<FinanceOverview> {
  const caseFin = await loadCaseFinancials(filters, tenantId);
  const statusFiltered = filters.paymentStatus
    ? caseFin.filter((c) => c.status === filters.paymentStatus)
    : caseFin;
  const caseIds = new Set(statusFiltered.map((c) => c.id));

  // Valid payments inside the period, joined for display.
  const paymentRows = caseIds.size
    ? await db
        .select({
          id: paymentsTable.id,
          paymentDate: paymentsTable.paymentDate,
          amount: paymentsTable.amount,
          paymentLabel: paymentsTable.paymentLabel,
          paymentMethod: paymentsTable.paymentMethod,
          implantCaseId: paymentsTable.implantCaseId,
          createdBy: paymentsTable.createdBy,
          patientId: patientsTable.id,
          patientName: patientsTable.fullName,
          fileNumber: patientsTable.fileNumber,
        })
        .from(paymentsTable)
        .innerJoin(
          implantCasesTable,
          eq(implantCasesTable.id, paymentsTable.implantCaseId),
        )
        .innerJoin(patientsTable, eq(patientsTable.id, implantCasesTable.patientId))
        .where(
          and(
            isNull(paymentsTable.voidedAt),
            gte(paymentsTable.paymentDate, filters.from),
            lte(paymentsTable.paymentDate, filters.to),
            inArray(paymentsTable.implantCaseId, [...caseIds]),
            eq(paymentsTable.tenantId, tenantId),
            eq(implantCasesTable.tenantId, tenantId),
            eq(patientsTable.tenantId, tenantId),
            filters.paymentMethod
              ? eq(paymentsTable.paymentMethod, filters.paymentMethod)
              : undefined,
          ),
        )
        .orderBy(desc(paymentsTable.paymentDate), desc(paymentsTable.createdAt))
    : [];

  const names = await userNames(paymentRows.map((p) => p.createdBy), tenantId);
  const payments: FinancePaymentRow[] = paymentRows.map((p) => ({
    id: p.id,
    paymentDate: p.paymentDate,
    patientId: p.patientId,
    patientName: p.patientName,
    fileNumber: p.fileNumber,
    implantCaseId: p.implantCaseId,
    paymentLabel: p.paymentLabel,
    amount: money(p.amount),
    paymentMethod: p.paymentMethod,
    createdByName: p.createdBy ? (names.get(p.createdBy) ?? null) : null,
  }));

  const collectedCents = payments.reduce((s, p) => s + toCents(p.amount), 0);

  // Charges / discounts recorded inside the period (same case scope).
  const [chargeRows, discountRows] = await Promise.all([
    caseIds.size
      ? db
          .select({ amount: caseChargesTable.amount })
          .from(caseChargesTable)
          .where(
            and(
              gte(caseChargesTable.chargeDate, filters.from),
              lte(caseChargesTable.chargeDate, filters.to),
              inArray(caseChargesTable.implantCaseId, [...caseIds]),
              eq(caseChargesTable.tenantId, tenantId),
            ),
          )
      : Promise.resolve([] as Array<{ amount: string }>),
    caseIds.size
      ? db
          .select({ amount: caseDiscountsTable.amount })
          .from(caseDiscountsTable)
          .where(
            and(
              gte(caseDiscountsTable.discountDate, filters.from),
              lte(caseDiscountsTable.discountDate, filters.to),
              inArray(caseDiscountsTable.implantCaseId, [...caseIds]),
              eq(caseDiscountsTable.tenantId, tenantId),
            ),
          )
      : Promise.resolve([] as Array<{ amount: string }>),
  ]);
  const chargesCents = chargeRows.reduce((s, r) => s + toCents(money(r.amount)), 0);
  const discountsCents = discountRows.reduce(
    (s, r) => s + toCents(money(r.amount)),
    0,
  );

  // Case value during the period (procedure date, falling back to creation date).
  const caseValueCents = statusFiltered
    .filter((c) => c.valueDate >= filters.from && c.valueDate <= filters.to)
    .reduce((s, c) => s + c.finalCents, 0);

  // Outstanding balances are point-in-time, not period-bound.
  const withBalance = statusFiltered.filter((c) => c.finalCents - c.paidCents > 0);
  const outstandingCents = withBalance.reduce(
    (s, c) => s + (c.finalCents - c.paidCents),
    0,
  );
  const patientsWithBalance = new Set(withBalance.map((c) => c.patientId)).size;

  // Charts: group daily for short ranges, monthly for long ones.
  const rangeDays =
    (Date.parse(filters.to) - Date.parse(filters.from)) / 86400000 + 1;
  const grouping: "day" | "month" = rangeDays > 62 ? "month" : "day";
  const seriesMap = new Map<string, number>();
  for (const p of payments) {
    const bucket = grouping === "day" ? p.paymentDate : p.paymentDate.slice(0, 7);
    seriesMap.set(bucket, (seriesMap.get(bucket) ?? 0) + toCents(p.amount));
  }
  const collectionSeries = [...seriesMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, cents]) => ({ bucket, amount: cents / 100 }));

  const methodMap = new Map<string, number>();
  for (const p of payments) {
    const method = p.paymentMethod ?? "أخرى";
    methodMap.set(method, (methodMap.get(method) ?? 0) + toCents(p.amount));
  }
  const methodDistribution = [...methodMap.entries()].map(([method, cents]) => ({
    method,
    amount: cents / 100,
  }));

  return {
    kpis: {
      collectedInPeriod: collectedCents / 100,
      caseValueInPeriod: caseValueCents / 100,
      chargesInPeriod: chargesCents / 100,
      discountsInPeriod: discountsCents / 100,
      totalOutstanding: outstandingCents / 100,
      paymentsCount: payments.length,
      patientsWithBalanceCount: patientsWithBalance,
    },
    collectionSeries,
    collectionGrouping: grouping,
    methodDistribution,
    payments,
  };
}

router.get("/finance/overview", requireFinanceView, async (req, res) => {
  const filters = parseOrRespond(financeFiltersSchema, req.query, res);
  if (!filters) return;
  res.json(await computeOverview(filters, req.currentTenant!.id));
});

/** CSV export (UTF-8 BOM so Arabic opens correctly in Excel). */
router.get("/finance/export.csv", requireFinanceView, async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const filters = parseOrRespond(financeFiltersSchema, req.query, res);
  if (!filters) return;
  const overview = await computeOverview(filters, tenantId);

  const esc = (v: string | number | null): string => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const header = [
    "التاريخ",
    "المريض",
    "رقم الملف",
    "رقم الحالة",
    "وصف الدفعة",
    "المبلغ",
    "طريقة الدفع",
    "المستخدم",
  ].join(",");
  const lines = overview.payments.map((p) =>
    [
      p.paymentDate,
      esc(p.patientName),
      esc(p.fileNumber),
      p.implantCaseId.slice(0, 8),
      esc(p.paymentLabel),
      p.amount.toFixed(2),
      esc(p.paymentMethod),
      esc(p.createdByName),
    ].join(","),
  );
  const csv = "\uFEFF" + [header, ...lines].join("\r\n");

  await writeAudit({
    tenantId,
    userId: req.currentUser!.id,
    action: "finance_export",
    entityType: "finance",
    summary: `تصدير تقرير الدفعات (${overview.payments.length} دفعة) للفترة ${filters.from} إلى ${filters.to}`,
  });
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="payments-${filters.from}-${filters.to}.csv"`,
  );
  res.send(csv);
});

export default router;
