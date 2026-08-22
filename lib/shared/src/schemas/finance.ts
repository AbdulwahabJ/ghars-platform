import { z } from "zod";

/* ------------------------------------------------------------------ */
/* Constants (exact Arabic copy from the specification)                */
/* ------------------------------------------------------------------ */

export const CHARGE_TYPES = [
  "زراعة عظم",
  "رفع جيب أنفي",
  "مؤقت",
  "إعادة زراعة",
  "إجراء إضافي",
  "ضريبة",
  "أخرى",
] as const;

export const PAYMENT_LABELS = [
  "دفعة أولى",
  "دفعة ثانية",
  "دفعة كاملة",
  "دفعة إضافية",
  "أخرى",
] as const;

export const PAYMENT_METHODS = [
  "شبكة",
  "نقدي",
  "تحويل",
  "تمارا",
  "أخرى",
] as const;

export const PAYMENT_STATUSES = [
  "لم يدفع",
  "مدفوع جزئيًا",
  "مدفوع بالكامل",
  "رصيد زائد",
  "مؤجل ماليًا",
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const INSTALLMENT_STATUSES = [
  "مدفوع",
  "مدفوع جزئيًا",
  "مستحق اليوم",
  "متأخر",
  "مجدول",
] as const;
export type InstallmentStatus = (typeof INSTALLMENT_STATUSES)[number];

/** Case status that marks a case as financially deferred. */
export const DEFERRED_CASE_STATUS = "مؤجل";

/* ------------------------------------------------------------------ */
/* Money helpers                                                       */
/* ------------------------------------------------------------------ */

/** Positive money value with at most 2 decimals, fits numeric(12,2). */
const moneySchema = z
  .number({ invalid_type_error: "المبلغ يجب أن يكون رقمًا." })
  .positive("المبلغ يجب أن يكون أكبر من صفر.")
  .max(9999999999.99, "المبلغ كبير جدًا.")
  .refine((v) => Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
    message: "المبلغ يجب ألا يتجاوز خانتين عشريتين.",
  })
  .transform((v) => Math.round(v * 100) / 100);

/** Non-negative variant (base treatment amount may be 0). */
const moneyOrZeroSchema = z
  .number({ invalid_type_error: "المبلغ يجب أن يكون رقمًا." })
  .min(0, "المبلغ لا يمكن أن يكون سالبًا.")
  .max(9999999999.99, "المبلغ كبير جدًا.")
  .transform((v) => Math.round(v * 100) / 100);

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة.");

const trimmedOrNull = z
  .string()
  .trim()
  .max(500, "النص طويل جدًا.")
  .transform((v) => (v.length ? v : null))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/**
 * Compute the payment status from integer cents (exact arithmetic).
 * Order matters: overpaid > fully paid > deferred > partial > unpaid.
 */
export function calcPaymentStatus(args: {
  finalTotalCents: number;
  paidCents: number;
  caseStatus: string;
}): PaymentStatus {
  const { finalTotalCents, paidCents, caseStatus } = args;
  if (paidCents > 0 && paidCents > finalTotalCents) return "رصيد زائد";
  if (finalTotalCents > 0 && paidCents === finalTotalCents)
    return "مدفوع بالكامل";
  if (caseStatus === DEFERRED_CASE_STATUS) return "مؤجل ماليًا";
  if (paidCents > 0) return "مدفوع جزئيًا";
  return "لم يدفع";
}

export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Split an amount in cents without floating-point drift. */
export function splitInstallmentAmount(
  totalAmount: number,
  installmentCount: number,
): number[] {
  const totalCents = toCents(totalAmount);
  const base = Math.floor(totalCents / installmentCount);
  const remainder = totalCents - base * installmentCount;
  return Array.from({ length: installmentCount }, (_, index) =>
    (base + (index < remainder ? 1 : 0)) / 100,
  );
}

export function addCalendarMonths(isoDate: string, months: number): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  const targetMonth = month - 1 + months;
  const targetYear = year + Math.floor(targetMonth / 12);
  const normalizedMonth = ((targetMonth % 12) + 12) % 12;
  const lastDay = new Date(Date.UTC(targetYear, normalizedMonth + 1, 0)).getUTCDate();
  return [
    String(targetYear).padStart(4, "0"),
    String(normalizedMonth + 1).padStart(2, "0"),
    String(Math.min(day, lastDay)).padStart(2, "0"),
  ].join("-");
}

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

export const baseAmountInputSchema = z.object({
  baseTreatmentAmount: moneyOrZeroSchema,
});
export type BaseAmountInput = z.infer<typeof baseAmountInputSchema>;

export const chargeInputSchema = z.object({
  chargeType: z
    .string()
    .trim()
    .min(1, "نوع الرسم مطلوب.")
    .max(120, "نوع الرسم طويل جدًا."),
  description: trimmedOrNull,
  amount: moneySchema,
  chargeDate: isoDateSchema,
  note: trimmedOrNull,
  /** Optional link to a specific implant of the same case. */
  implantId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
});
export type ChargeInput = z.infer<typeof chargeInputSchema>;

export const discountInputSchema = z.object({
  amount: moneySchema,
  discountDate: isoDateSchema,
  reason: z
    .string()
    .trim()
    .min(1, "سبب الخصم مطلوب.")
    .max(500, "السبب طويل جدًا."),
});
export type DiscountInput = z.infer<typeof discountInputSchema>;

export const paymentInputSchema = z.object({
  amount: moneySchema,
  paymentDate: isoDateSchema,
  paymentLabel: z.enum(PAYMENT_LABELS, {
    errorMap: () => ({ message: "وصف الدفعة غير صحيح." }),
  }),
  paymentMethod: z.enum(PAYMENT_METHODS, {
    errorMap: () => ({ message: "طريقة الدفع غير صحيحة." }),
  }),
  referenceNumber: trimmedOrNull,
  note: trimmedOrNull,
  installmentId: z.string().uuid().nullable().optional().transform((v) => v ?? null),
});
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const voidPaymentInputSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "سبب الإلغاء مطلوب.")
    .max(500, "السبب طويل جدًا."),
});
export type VoidPaymentInput = z.infer<typeof voidPaymentInputSchema>;

export const paymentUpdateSchema = paymentInputSchema.partial();
export type PaymentUpdateInput = z.infer<typeof paymentUpdateSchema>;

/* ------------------------------------------------------------------ */
/* DTOs                                                                */
/* ------------------------------------------------------------------ */

export const chargeSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  implantId: z.string().uuid().nullable(),
  implantSite: z.string().nullable(),
  chargeType: z.string(),
  description: z.string().nullable(),
  amount: z.number(),
  chargeDate: z.string(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type Charge = z.infer<typeof chargeSchema>;

export const discountSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  amount: z.number(),
  discountDate: z.string(),
  reason: z.string().nullable(),
  approvedByName: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
});
export type Discount = z.infer<typeof discountSchema>;

export const paymentSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  installmentId: z.string().uuid().nullable(),
  amount: z.number(),
  paymentDate: z.string(),
  paymentLabel: z.string().nullable(),
  paymentMethod: z.string().nullable(),
  referenceNumber: z.string().nullable(),
  note: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  isVoided: z.boolean(),
  voidedAt: z.string().nullable(),
  voidedByName: z.string().nullable(),
  voidReason: z.string().nullable(),
});
export type Payment = z.infer<typeof paymentSchema>;

export const installmentSchema = z.object({
  id: z.string().uuid(),
  planId: z.string().uuid(),
  sequence: z.number().int(),
  dueDate: z.string(),
  amount: z.number(),
  paidAmount: z.number(),
  outstanding: z.number(),
  status: z.enum(INSTALLMENT_STATUSES),
});
export type Installment = z.infer<typeof installmentSchema>;

export const installmentPlanSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  totalAmount: z.number(),
  installmentCount: z.number().int(),
  firstDueDate: z.string(),
  installments: z.array(installmentSchema),
});
export type InstallmentPlan = z.infer<typeof installmentPlanSchema>;

export const installmentPlanInputSchema = z.object({
  totalAmount: moneySchema,
  installmentCount: z
    .number()
    .int()
    .min(1, "عدد الأقساط يجب أن يكون واحدًا على الأقل.")
    .max(60, "عدد الأقساط كبير جدًا."),
  firstDueDate: isoDateSchema,
});
export type InstallmentPlanInput = z.infer<typeof installmentPlanInputSchema>;

/** Case financial summary — all values computed, never stored. */
export const caseFinanceSummarySchema = z.object({
  implantCaseId: z.string().uuid(),
  baseTreatmentAmount: z.number(),
  chargesTotal: z.number(),
  discountsTotal: z.number(),
  finalTotal: z.number(),
  paidAmount: z.number(),
  outstanding: z.number(),
  /** 0–100 (may exceed 100 when overpaid); null when final total is 0. */
  paymentPercent: z.number().nullable(),
  paymentStatus: z.enum(PAYMENT_STATUSES),
  isOverpaid: z.boolean(),
});
export type CaseFinanceSummary = z.infer<typeof caseFinanceSummarySchema>;

export const caseFinanceResponseSchema = z.object({
  summary: caseFinanceSummarySchema,
  installmentPlan: installmentPlanSchema.nullable(),
  charges: z.array(chargeSchema),
  discounts: z.array(discountSchema),
  payments: z.array(paymentSchema),
});
export type CaseFinanceResponse = z.infer<typeof caseFinanceResponseSchema>;

/* ------------------------------------------------------------------ */
/* Finance page                                                        */
/* ------------------------------------------------------------------ */

export const financeFiltersSchema = z.object({
  from: isoDateSchema,
  to: isoDateSchema,
  patientName: z.string().trim().max(120).optional(),
  fileNumber: z.string().trim().max(40).optional(),
  paymentMethod: z.enum(PAYMENT_METHODS).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  implantSystem: z.string().trim().max(120).optional(),
});
export type FinanceFilters = z.infer<typeof financeFiltersSchema>;

export const financePaymentRowSchema = z.object({
  id: z.string().uuid(),
  paymentDate: z.string(),
  patientId: z.string().uuid(),
  patientName: z.string(),
  fileNumber: z.string(),
  implantCaseId: z.string().uuid(),
  paymentLabel: z.string().nullable(),
  amount: z.number(),
  paymentMethod: z.string().nullable(),
  createdByName: z.string().nullable(),
});
export type FinancePaymentRow = z.infer<typeof financePaymentRowSchema>;

export const financeOverviewSchema = z.object({
  kpis: z.object({
    collectedInPeriod: z.number(),
    caseValueInPeriod: z.number(),
    chargesInPeriod: z.number(),
    discountsInPeriod: z.number(),
    totalOutstanding: z.number(),
    paymentsCount: z.number(),
    patientsWithBalanceCount: z.number(),
  }),
  /** Collection over time; bucket is an ISO date (daily) or YYYY-MM (monthly). */
  collectionSeries: z.array(
    z.object({ bucket: z.string(), amount: z.number() }),
  ),
  collectionGrouping: z.enum(["day", "month"]),
  methodDistribution: z.array(
    z.object({ method: z.string(), amount: z.number() }),
  ),
  payments: z.array(financePaymentRowSchema),
});
export type FinanceOverview = z.infer<typeof financeOverviewSchema>;

/* ------------------------------------------------------------------ */
/* Error codes                                                         */
/* ------------------------------------------------------------------ */

export const PAYMENT_NOT_FOUND = "PAYMENT_NOT_FOUND";
export const PAYMENT_ALREADY_VOIDED = "PAYMENT_ALREADY_VOIDED";
export const CHARGE_NOT_FOUND = "CHARGE_NOT_FOUND";
export const DISCOUNT_NOT_FOUND = "DISCOUNT_NOT_FOUND";
/** 400 — linked implant does not belong to the same case. */
export const CHARGE_IMPLANT_INVALID = "CHARGE_IMPLANT_INVALID";
/** 403 — missing financial permission. */
export const FORBIDDEN_FINANCIAL = "FORBIDDEN_FINANCIAL";
