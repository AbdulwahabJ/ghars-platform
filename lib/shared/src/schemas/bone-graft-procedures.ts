import { z } from "zod";

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة.");

const optionalText = (max: number, message: string) =>
  z
    .string()
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);

export const BONE_GRAFT_LOOKUP_CATEGORIES = {
  procedureType: "bone_graft_procedure_type",
  material: "bone_graft_material",
  membrane: "bone_graft_membrane",
  status: "bone_graft_status",
} as const;

export const ADJUNCT_PROCEDURE_CATEGORIES = [
  "زراعة عظم",
  "رفع الجيب الفكي",
  "إبعاد / نقل العصب السنخي السفلي",
] as const;
export type AdjunctProcedureCategory =
  (typeof ADJUNCT_PROCEDURE_CATEGORIES)[number];

export const PROCEDURE_SIDES = ["يمين", "يسار"] as const;
export type ProcedureSide = (typeof PROCEDURE_SIDES)[number];

export const SINUS_LIFT_TYPES = ["مفتوح", "مغلق", "أخرى"] as const;

export const boneGraftProcedureSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  implantId: z.string().uuid().nullable(),
  procedureDate: z.string(),
  procedureCategory: z.enum(ADJUNCT_PROCEDURE_CATEGORIES),
  procedureType: z.string(),
  procedureSide: z.enum(PROCEDURE_SIDES).nullable(),
  liftType: z.string().nullable(),
  site: z.string().nullable(),
  material: z.string().nullable(),
  membrane: z.string().nullable(),
  quantity: z.string().nullable(),
  size: z.string().nullable(),
  treatingDoctor: z.string(),
  procedureStatus: z.string(),
  note: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type BoneGraftProcedure = z.infer<typeof boneGraftProcedureSchema>;

export const boneGraftProcedureInputFields = z.object({
    implantId: z.string().uuid("معرّف الزرعة غير صحيح.").nullish().transform((value) => value ?? null),
    procedureDate: isoDateSchema,
    /**
     * Defaults only for backward-compatible API clients. New UI always sends
     * an explicit category from the required selector.
     */
    procedureCategory: z.enum(ADJUNCT_PROCEDURE_CATEGORIES).default("زراعة عظم"),
    procedureType: z.string().trim().min(1, "وصف الإجراء مطلوب.").max(200, "وصف الإجراء طويل جدًا."),
    procedureSide: z
      .enum(PROCEDURE_SIDES, { message: "حدد جهة الإجراء." })
      .nullish()
      .transform((value) => value ?? null),
    liftType: optionalText(100, "نوع الرفع طويل جدًا."),
    site: optionalText(100, "موضع الإجراء طويل جدًا."),
    material: optionalText(200, "مادة الإجراء طويلة جدًا."),
    membrane: optionalText(200, "الغشاء طويل جدًا."),
    quantity: optionalText(100, "الكمية طويلة جدًا."),
    size: optionalText(100, "المقاس طويل جدًا."),
    treatingDoctor: z.string().trim().min(1, "اسم الطبيب المعالج مطلوب.").max(200, "اسم الطبيب طويل جدًا.").default("د. همام"),
    procedureStatus: z.string().trim().min(1, "حالة الإجراء مطلوبة.").max(100, "حالة الإجراء طويلة جدًا.").default("مخطط"),
    note: optionalText(2000, "الملاحظة طويلة جدًا."),
  });

export const boneGraftProcedureInputSchema = boneGraftProcedureInputFields
  .superRefine((value, context) => {
    if (
      (value.procedureCategory === "رفع الجيب الفكي" ||
        value.procedureCategory === "إبعاد / نقل العصب السنخي السفلي") &&
      !value.procedureSide
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["procedureSide"],
        message:
          value.procedureCategory === "رفع الجيب الفكي"
            ? "حدد جهة رفع الجيب الفكي."
            : "حدد جهة إجراء العصب.",
      });
    }
  });
export type BoneGraftProcedureInput = z.infer<
  typeof boneGraftProcedureInputSchema
>;

export const boneGraftProcedureUpdateSchema = boneGraftProcedureInputFields
  .partial()
  .refine((value) => Object.keys(value).length > 0, "لا توجد تعديلات لإرسالها.");
export type BoneGraftProcedureUpdate = z.infer<
  typeof boneGraftProcedureUpdateSchema
>;