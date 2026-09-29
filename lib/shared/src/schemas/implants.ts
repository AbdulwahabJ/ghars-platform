import { z } from "zod";
import { boneGraftProcedureSchema } from "./bone-graft-procedures";
import { prostheticEventSchema } from "./prosthetic-events";

/**
 * Phase 2 contracts — implant cases and implants.
 *
 * Legacy fields (System, site, SIZE, Q, Former, Graft, Pros, NOTE) keep
 * their original names and neutral meanings. Values are stored as entered.
 * There is deliberately no graft cost anywhere in Phase 2 — any future graft
 * money belongs only to case_charges (Phase 3).
 */

export const DEFAULT_TREATING_DOCTOR = "د. همام";

/** The exact 18 case statuses from the specification — do not reword. */
export const CASE_STATUSES = [
  "حالة جديدة",
  "تمت الزراعة",
  "مرحلة الالتئام",
  "تحت المتابعة",
  "يحتاج تواصل",
  "جاهز للتركيب",
  "تم تحديد موعد التركيب",
  "تم تركيب مؤقت",
  "تحويل المؤقت إلى دائم",
  "تم التركيب",
  "مؤجل",
  "لم يحضر",
  "منقطع",
  "زرعة فاشلة",
  "يحتاج إعادة زراعة",
  "تمت إعادة الزراعة",
  "استكمال العلاج في عيادة أخرى",
  "مكتمل",
] as const;
export const caseStatusSchema = z.enum(CASE_STATUSES);
export type CaseStatus = z.infer<typeof caseStatusSchema>;

/** The exact 9 implant statuses from the specification — do not reword. */
export const IMPLANT_STATUSES = [
  "مزروعة",
  "مرحلة الالتئام",
  "جاهزة للتركيب",
  "تم تركيب مؤقت",
  "تم التركيب",
  "فاشلة",
  "تحتاج إعادة",
  "تمت إعادة الزراعة",
  "مؤرشفة",
] as const;
export const implantStatusSchema = z.enum(IMPLANT_STATUSES);
export type ImplantStatus = z.infer<typeof implantStatusSchema>;

/**
 * Implant statuses that permit another active implant on the same site in
 * the same case (the documented reimplantation workflow): after a failure,
 * a new implant may be recorded on the same tooth.
 */
export const REIMPLANTABLE_STATUSES: readonly ImplantStatus[] = [
  "فاشلة",
  "تحتاج إعادة",
];

/** Pros (مدة التركيب) suggested values; a custom free value is also allowed. */
export const PROS_SUGGESTED_VALUES = ["2M", "3M"] as const;

/** FDI chart rows exactly as specified (viewer's left to right). */
export const FDI_UPPER_ROW = [
  "18", "17", "16", "15", "14", "13", "12", "11",
  "21", "22", "23", "24", "25", "26", "27", "28",
] as const;
export const FDI_LOWER_ROW = [
  "48", "47", "46", "45", "44", "43", "42", "41",
  "31", "32", "33", "34", "35", "36", "37", "38",
] as const;
export const FDI_SITES = [...FDI_UPPER_ROW, ...FDI_LOWER_ROW] as const;
export const fdiSiteSchema = z.enum(
  FDI_SITES as unknown as [string, ...string[]],
);

/** Lookup option categories (Admin-manageable in Phase 6). */
export const LOOKUP_CATEGORIES = {
  qValue: "q_value",
  formerValue: "former_value",
  graftValue: "graft_value",
  procedureTag: "procedure_tag",
  boneGraftProcedureType: "bone_graft_procedure_type",
  boneGraftMaterial: "bone_graft_material",
  boneGraftMembrane: "bone_graft_membrane",
  boneGraftStatus: "bone_graft_status",
} as const;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة.");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((v) => (v ? v : null));

/* ------------------------------------------------------------------ */
/* Implant case                                                        */
/* ------------------------------------------------------------------ */

export const implantCaseSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  procedureDate: z.string().nullable(),
  treatingDoctor: z.string(),
  referringDoctor: z.string().nullable(),
  caseStatus: caseStatusSchema,
  prosValue: z.string().nullable(),
  expectedProstheticDate: z.string().nullable(),
  generalNote: z.string().nullable(),
  legacyCostNote: z.string().nullable(),
  isReimplantation: z.boolean(),
  reimplantationReason: z.string().nullable(),
  sourceCaseId: z.string().uuid().nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type ImplantCase = z.infer<typeof implantCaseSchema>;

export const implantCaseInputSchema = z.object({
  procedureDate: isoDateSchema.nullish().transform((v) => v ?? null),
  treatingDoctor: z
    .string()
    .trim()
    .min(1, "اسم الطبيب المعالج مطلوب.")
    .max(200, "اسم الطبيب طويل جدًا.")
    .default(DEFAULT_TREATING_DOCTOR),
  referringDoctor: optionalText(200, "اسم الطبيب المحوِّل طويل جدًا."),
  caseStatus: caseStatusSchema.default("حالة جديدة"),
  prosValue: optionalText(50, "قيمة مدة التركيب طويلة جدًا."),
  expectedProstheticDate: isoDateSchema.nullish().transform((v) => v ?? null),
  generalNote: optionalText(2000, "الملاحظة طويلة جدًا."),
  legacyCostNote: optionalText(2000, "الملاحظة المالية القديمة طويلة جدًا."),
  isReimplantation: z.boolean().default(false),
  reimplantationReason: optionalText(1000, "سبب إعادة الزراعة طويل جدًا."),
  sourceCaseId: z
    .string()
    .uuid("معرّف الحالة المصدر غير صحيح.")
    .nullish()
    .transform((v) => v ?? null),
});
export type ImplantCaseInput = z.infer<typeof implantCaseInputSchema>;

export const implantCaseUpdateSchema = implantCaseInputSchema.partial();
export type ImplantCaseUpdate = z.infer<typeof implantCaseUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Implant                                                             */
/* ------------------------------------------------------------------ */

/** Positive decimal with at most 2 decimal places (e.g. 3.5, 3.75, 10). */
const sizeNumberSchema = z
  .number()
  .positive("القيمة يجب أن تكون أكبر من صفر.")
  .max(99.99, "القيمة كبيرة جدًا.")
  .refine((v) => Math.round(v * 100) === v * 100 || Math.abs(Math.round(v * 100) - v * 100) < 1e-6, {
    message: "يُسمح بخانتين عشريتين كحد أقصى.",
  });

export const implantSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  site: z.string(),
  isCustomSite: z.boolean(),
  system: z.string().nullable(),
  diameter: z.number().nullable(),
  length: z.number().nullable(),
  qValue: z.string().nullable(),
  formerValue: z.string().nullable(),
  immediatePlacement: z.enum(["YES", "NO", "UNSPECIFIED"]),
  graftValue: z.string().nullable(),
  graftProcedureType: z.string().nullable(),
  graftNote: z.string().nullable(),
  procedureTags: z.array(z.string()),
  implantStatus: implantStatusSchema,
  implantNote: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Implant = z.infer<typeof implantSchema>;

export const implantInputSchema = z.object({
  site: fdiSiteSchema,
  system: optionalText(100, "اسم النظام طويل جدًا."),
  diameter: sizeNumberSchema.nullish().transform((v) => v ?? null),
  length: sizeNumberSchema.nullish().transform((v) => v ?? null),
  qValue: optionalText(50, "قيمة Q طويلة جدًا."),
  formerValue: optionalText(50, "قيمة Former طويلة جدًا."),
  immediatePlacement: z.enum(["YES", "NO", "UNSPECIFIED"]).default("UNSPECIFIED"),
  graftValue: optionalText(50, "قيمة Graft طويلة جدًا."),
  graftProcedureType: optionalText(200, "نوع إجراء الترقيع طويل جدًا."),
  graftNote: optionalText(2000, "ملاحظة الترقيع طويلة جدًا."),
  procedureTags: z
    .array(z.string().trim().min(1).max(50, "الوسم طويل جدًا."))
    .max(20, "عدد الوسوم كبير جدًا.")
    .default([]),
  implantStatus: implantStatusSchema.default("مزروعة"),
  implantNote: optionalText(2000, "الملاحظة طويلة جدًا."),
});
export type ImplantInput = z.infer<typeof implantInputSchema>;

export const implantUpdateSchema = implantInputSchema.partial();
export type ImplantUpdate = z.infer<typeof implantUpdateSchema>;

/* ------------------------------------------------------------------ */
/* Responses                                                           */
/* ------------------------------------------------------------------ */

export const implantCaseWithImplantsSchema = implantCaseSchema.extend({
  implants: z.array(implantSchema),
  prostheticEvents: z.array(prostheticEventSchema),
  boneGraftProcedures: z.array(boneGraftProcedureSchema),
});
export type ImplantCaseWithImplants = z.infer<
  typeof implantCaseWithImplantsSchema
>;

export const caseListResponseSchema = z.object({
  items: z.array(implantCaseWithImplantsSchema),
});
export type CaseListResponse = z.infer<typeof caseListResponseSchema>;

/** Phase-2 option lists, read from Admin-manageable tables (never hard-coded). */
export const implantOptionsResponseSchema = z.object({
  systems: z.array(z.string()),
  qValues: z.array(z.string()),
  formerValues: z.array(z.string()),
  graftValues: z.array(z.string()),
  procedureTags: z.array(z.string()),
  boneGraftProcedureTypes: z.array(z.string()),
  boneGraftMaterials: z.array(z.string()),
  boneGraftMembranes: z.array(z.string()),
  boneGraftStatuses: z.array(z.string()),
});
export type ImplantOptionsResponse = z.infer<
  typeof implantOptionsResponseSchema
>;

/* ------------------------------------------------------------------ */
/* Error codes                                                         */
/* ------------------------------------------------------------------ */

export const CASE_NOT_FOUND = "CASE_NOT_FOUND";
/** 409 — the parent patient file is archived; all implant writes are blocked. */
export const PATIENT_ARCHIVED = "PATIENT_ARCHIVED";
export const IMPLANT_NOT_FOUND = "IMPLANT_NOT_FOUND";
export const CASE_ARCHIVED = "CASE_ARCHIVED";
export const IMPLANT_ARCHIVED = "IMPLANT_ARCHIVED";
/** 409 — an active implant already exists on this site in the same case. */
export const DUPLICATE_SITE = "DUPLICATE_SITE";
/** 400 — sourceCaseId does not exist or belongs to another patient. */
export const SOURCE_CASE_INVALID = "SOURCE_CASE_INVALID";
