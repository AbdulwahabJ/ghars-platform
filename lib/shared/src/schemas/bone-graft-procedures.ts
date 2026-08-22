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

export const boneGraftProcedureSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  implantId: z.string().uuid().nullable(),
  procedureDate: z.string(),
  procedureType: z.string(),
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

export const boneGraftProcedureInputSchema = z.object({
  implantId: z.string().uuid("معرّف الزرعة غير صحيح.").nullish().transform((value) => value ?? null),
  procedureDate: isoDateSchema,
  procedureType: z.string().trim().min(1, "نوع الإجراء مطلوب.").max(200, "نوع الإجراء طويل جدًا."),
  site: optionalText(100, "موضع الإجراء طويل جدًا."),
  material: optionalText(200, "مادة الترقيع طويلة جدًا."),
  membrane: optionalText(200, "الغشاء طويل جدًا."),
  quantity: optionalText(100, "الكمية طويلة جدًا."),
  size: optionalText(100, "المقاس طويل جدًا."),
  treatingDoctor: z.string().trim().min(1, "اسم الطبيب المعالج مطلوب.").max(200, "اسم الطبيب طويل جدًا.").default("د. همام"),
  procedureStatus: z.string().trim().min(1, "حالة الإجراء مطلوبة.").max(100, "حالة الإجراء طويلة جدًا.").default("مخطط"),
  note: optionalText(2000, "الملاحظة طويلة جدًا."),
});
export type BoneGraftProcedureInput = z.infer<
  typeof boneGraftProcedureInputSchema
>;

export const boneGraftProcedureUpdateSchema = boneGraftProcedureInputSchema
  .partial()
  .refine((value) => Object.keys(value).length > 0, "لا توجد تعديلات لإرسالها.");
export type BoneGraftProcedureUpdate = z.infer<
  typeof boneGraftProcedureUpdateSchema
>;