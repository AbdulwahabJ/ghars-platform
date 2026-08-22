import { z } from "zod";
import { passwordSchema, userRoleSchema } from "./auth";

/* ------------------------------------------------------------------ */
/* User management (Admin)                                             */
/* ------------------------------------------------------------------ */

/** Data-URL avatar (PNG/JPEG/WebP only, ~1 MB max after 512×512 resize). */
export const avatarDataUrlSchema = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
    "صيغة الصورة غير مدعومة. الرجاء استخدام PNG أو JPEG أو WebP.",
  )
  .max(1_400_000, "حجم الصورة كبير جدًا. الحد الأقصى حوالي 1 ميغابايت.");

export const adminUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  role: userRoleSchema,
  isActive: z.boolean(),
  /** Raw user-level overrides (null = role default applies). */
  canViewFinancialsOverride: z.boolean().nullable(),
  canRecordPaymentsOverride: z.boolean().nullable(),
  /** Effective permissions after applying role defaults. */
  canViewFinancials: z.boolean(),
  canRecordPayments: z.boolean(),
  lastLoginAt: z.string().nullable(),
  createdAt: z.string(),
  /** Profile photo as a base-64 data URL, or null when none is set. */
  avatarData: z.string().nullable(),
});
export type AdminUser = z.infer<typeof adminUserSchema>;

export const adminUsersResponseSchema = z.object({
  users: z.array(adminUserSchema),
});
export type AdminUsersResponse = z.infer<typeof adminUsersResponseSchema>;

const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل.")
  .max(50, "اسم المستخدم طويل جدًا.")
  .regex(
    /^[a-z0-9._-]+$/,
    "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية صغيرة وأرقام فقط.",
  );

const fullNameSchema = z
  .string()
  .trim()
  .min(2, "الاسم الكامل مطلوب.")
  .max(120, "الاسم طويل جدًا.");

/** null = follow role default. */
const overrideSchema = z.boolean().nullable();

export const createUserInputSchema = z.object({
  username: usernameSchema,
  fullName: fullNameSchema,
  role: userRoleSchema,
  password: passwordSchema,
  canViewFinancials: overrideSchema.optional(),
  canRecordPayments: overrideSchema.optional(),
  /** Optional profile photo data URL. */
  avatarData: avatarDataUrlSchema.nullable().optional(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

export const updateUserInputSchema = z
  .object({
    fullName: fullNameSchema.optional(),
    role: userRoleSchema.optional(),
    canViewFinancials: overrideSchema.optional(),
    canRecordPayments: overrideSchema.optional(),
    /**
     * null  = remove photo (revert to initials fallback).
     * string = replace with new data URL.
     * absent = do not touch photo.
     */
    avatarData: z.union([avatarDataUrlSchema, z.null()]).optional(),
  })
  .refine(
    (v) => Object.keys(v).length > 0,
    "لا توجد تعديلات لإرسالها.",
  );
export type UpdateUserInput = z.infer<typeof updateUserInputSchema>;

export const resetPasswordInputSchema = z.object({
  password: passwordSchema,
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

/* ------------------------------------------------------------------ */
/* Application settings                                                */
/* ------------------------------------------------------------------ */

export const APP_SETTING_KEYS = [
  "clinicName",
  "systemName",
  "defaultTreatingDoctor",
  "clinicPhone",
  "clinicAddress",
  "defaultProsValue",
  "defaultFollowupAssigneeUserId",
  "clinicLogo",
] as const;
export type AppSettingKey = (typeof APP_SETTING_KEYS)[number];

export const APP_SETTINGS_DEFAULTS = {
  clinicName: "مجمع السن الرقمي الطبي",
  systemName: "نظام متابعة زراعة الأسنان – د. همام",
  defaultTreatingDoctor: "د. همام",
  clinicPhone: null as string | null,
  clinicAddress: null as string | null,
  defaultProsValue: null as string | null,
  defaultFollowupAssigneeUserId: null as string | null,
  clinicLogo: null as string | null,
};

const optionalSettingText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, "النص طويل جدًا.")
    .transform((v) => (v.length === 0 ? null : v))
    .nullable();

/** Data-URL clinic logo (PNG/JPEG/WebP only, ~500KB max). */
const logoSchema = z
  .string()
  .regex(
    /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/,
    "صيغة الشعار غير مدعومة. الرجاء استخدام PNG أو JPEG أو WebP.",
  )
  .max(700_000, "حجم الشعار كبير جدًا. الحد الأقصى 500 كيلوبايت.")
  .nullable();

export const appSettingsSchema = z.object({
  clinicName: z.string().trim().min(1, "اسم العيادة مطلوب.").max(150),
  systemName: z.string().trim().min(1, "اسم النظام مطلوب.").max(150),
  defaultTreatingDoctor: z
    .string()
    .trim()
    .min(1, "اسم الطبيب المعالج الافتراضي مطلوب.")
    .max(120),
  clinicPhone: optionalSettingText(30),
  clinicAddress: optionalSettingText(300),
  defaultProsValue: optionalSettingText(60),
  defaultFollowupAssigneeUserId: z.string().uuid().nullable(),
  clinicLogo: logoSchema,
});
export type AppSettings = z.infer<typeof appSettingsSchema>;

export const updateAppSettingsInputSchema = appSettingsSchema
  .partial()
  .refine((v) => Object.keys(v).length > 0, "لا توجد تعديلات لإرسالها.");
export type UpdateAppSettingsInput = z.infer<
  typeof updateAppSettingsInputSchema
>;

export const appSettingsResponseSchema = z.object({
  settings: appSettingsSchema,
});
export type AppSettingsResponse = z.infer<typeof appSettingsResponseSchema>;

/* ------------------------------------------------------------------ */
/* Lookup management                                                   */
/* ------------------------------------------------------------------ */

/** Admin-manageable lookup categories ("implant_system" is a dedicated table). */
export const ADMIN_LOOKUP_CATEGORIES = [
  "implant_system",
  "q_value",
  "former_value",
  "graft_value",
  "procedure_tag",
  "bone_graft_procedure_type",
  "bone_graft_material",
  "bone_graft_membrane",
  "bone_graft_status",
] as const;
export type AdminLookupCategory = (typeof ADMIN_LOOKUP_CATEGORIES)[number];

export const ADMIN_LOOKUP_CATEGORY_LABELS: Record<AdminLookupCategory, string> =
  {
    implant_system: "أنظمة الزرعات",
    q_value: "خيارات Q",
    former_value: "خيارات Former",
    graft_value: "خيارات Graft",
    procedure_tag: "وسوم الإجراء",
    bone_graft_procedure_type: "أنواع إجراءات زراعة العظم",
    bone_graft_material: "مواد زراعة العظم",
    bone_graft_membrane: "أغشية زراعة العظم",
    bone_graft_status: "حالات إجراءات زراعة العظم",
  };

export const adminLookupOptionSchema = z.object({
  id: z.string().uuid(),
  category: z.enum(ADMIN_LOOKUP_CATEGORIES),
  value: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
  /** True when historical records reference this value (deletion blocked). */
  isReferenced: z.boolean(),
});
export type AdminLookupOption = z.infer<typeof adminLookupOptionSchema>;

export const adminLookupsResponseSchema = z.object({
  options: z.array(adminLookupOptionSchema),
});
export type AdminLookupsResponse = z.infer<typeof adminLookupsResponseSchema>;

const lookupValueSchema = z
  .string()
  .trim()
  .min(1, "القيمة مطلوبة.")
  .max(80, "القيمة طويلة جدًا.");

export const createLookupOptionInputSchema = z.object({
  category: z.enum(ADMIN_LOOKUP_CATEGORIES, {
    errorMap: () => ({ message: "فئة القائمة غير معروفة." }),
  }),
  value: lookupValueSchema,
});
export type CreateLookupOptionInput = z.infer<
  typeof createLookupOptionInputSchema
>;

export const updateLookupOptionInputSchema = z.object({
  value: lookupValueSchema,
});
export type UpdateLookupOptionInput = z.infer<
  typeof updateLookupOptionInputSchema
>;

export const reorderLookupOptionsInputSchema = z.object({
  category: z.enum(ADMIN_LOOKUP_CATEGORIES),
  orderedIds: z.array(z.string().uuid()).min(1, "قائمة الترتيب فارغة."),
});
export type ReorderLookupOptionsInput = z.infer<
  typeof reorderLookupOptionsInputSchema
>;

/* ------------------------------------------------------------------ */
/* WhatsApp template management                                        */
/* ------------------------------------------------------------------ */

export const TEMPLATE_PLACEHOLDERS = ["patientName", "date", "time"] as const;

export const TEMPLATE_PLACEHOLDER_LABELS: Record<string, string> = {
  patientName: "اسم المريض",
  date: "التاريخ",
  time: "الوقت",
};

/** Returns the list of unknown placeholders found in a template body. */
export function findUnknownPlaceholders(body: string): string[] {
  const known = new Set<string>(TEMPLATE_PLACEHOLDERS);
  const unknown: string[] = [];
  for (const match of body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    const name = match[1] ?? "";
    if (!known.has(name) && !unknown.includes(name)) {
      unknown.push(name);
    }
  }
  return unknown;
}

export const adminTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  body: z.string(),
  isApproved: z.boolean(),
  sortOrder: z.number().int(),
  updatedAt: z.string(),
});
export type AdminTemplate = z.infer<typeof adminTemplateSchema>;

export const adminTemplatesResponseSchema = z.object({
  templates: z.array(adminTemplateSchema),
});
export type AdminTemplatesResponse = z.infer<
  typeof adminTemplatesResponseSchema
>;

export const updateTemplateInputSchema = z
  .object({
    name: z.string().trim().min(1, "اسم القالب مطلوب.").max(120).optional(),
    body: z
      .string()
      .trim()
      .min(1, "نص القالب مطلوب.")
      .max(2000, "نص القالب طويل جدًا.")
      .optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "لا توجد تعديلات لإرسالها.")
  .superRefine((v, ctx) => {
    if (v.body) {
      const unknown = findUnknownPlaceholders(v.body);
      if (unknown.length > 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `متغيرات غير معروفة في نص القالب: ${unknown
            .map((u) => `{{${u}}}`)
            .join("، ")}. المتغيرات المدعومة: {{patientName}}، {{date}}، {{time}}.`,
          path: ["body"],
        });
      }
    }
  });
export type UpdateTemplateInput = z.infer<typeof updateTemplateInputSchema>;

/* ------------------------------------------------------------------ */
/* Audit log viewer                                                    */
/* ------------------------------------------------------------------ */

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة.");

export const auditFiltersSchema = z
  .object({
    from: isoDateSchema.optional(),
    to: isoDateSchema.optional(),
    userId: z.string().uuid().optional(),
    action: z.string().trim().min(1).max(80).optional(),
    entityType: z.string().trim().min(1).max(80).optional(),
    fileNumber: z.string().trim().min(1).max(40).optional(),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .refine(
    (v) => !v.from || !v.to || v.from <= v.to,
    "تاريخ البداية يجب أن يكون قبل تاريخ النهاية.",
  );
export type AuditFilters = z.infer<typeof auditFiltersSchema>;

export const auditLogEntrySchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string(),
  userName: z.string().nullable(),
  action: z.string(),
  entityType: z.string().nullable(),
  entityId: z.string().nullable(),
  summary: z.string().nullable(),
});
export type AuditLogEntry = z.infer<typeof auditLogEntrySchema>;

export const auditLogResponseSchema = z.object({
  items: z.array(auditLogEntrySchema),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  /** Distinct values available for filtering. */
  actions: z.array(z.string()),
  entityTypes: z.array(z.string()),
  users: z.array(z.object({ id: z.string().uuid(), fullName: z.string() })),
});
export type AuditLogResponse = z.infer<typeof auditLogResponseSchema>;

/* ------------------------------------------------------------------ */
/* Legacy data import                                                  */
/* ------------------------------------------------------------------ */

export const IMPORT_TYPES = [
  "patients",
  "cases",
  "implants",
  "payments",
  "followups",
] as const;
export type ImportType = (typeof IMPORT_TYPES)[number];

export const IMPORT_TYPE_LABELS: Record<ImportType, string> = {
  patients: "المرضى",
  cases: "حالات الزراعة",
  implants: "الزرعات",
  payments: "الدفعات",
  followups: "المتابعات",
};

export const IMPORT_MODES = ["create_only", "skip_duplicates"] as const;
export type ImportMode = (typeof IMPORT_MODES)[number];

export const importRequestSchema = z.object({
  type: z.enum(IMPORT_TYPES, {
    errorMap: () => ({ message: "نوع الاستيراد غير معروف." }),
  }),
  /** Raw CSV file content (UTF-8). */
  content: z
    .string()
    .min(1, "الملف فارغ.")
    .max(4_000_000, "الملف كبير جدًا. الحد الأقصى 4 ميغابايت."),
  mode: z.enum(IMPORT_MODES).default("skip_duplicates"),
});
export type ImportRequest = z.infer<typeof importRequestSchema>;

export const importRowStatusSchema = z.enum(["valid", "invalid", "duplicate"]);
export type ImportRowStatus = z.infer<typeof importRowStatusSchema>;

export const importRowResultSchema = z.object({
  /** 1-based data row number (excluding the header row). */
  rowNumber: z.number().int(),
  status: importRowStatusSchema,
  /** Short human summary of the row (name / file number / amount...). */
  summary: z.string(),
  errors: z.array(z.string()),
});
export type ImportRowResult = z.infer<typeof importRowResultSchema>;

export const importPreviewResponseSchema = z.object({
  type: z.enum(IMPORT_TYPES),
  totalRows: z.number().int(),
  validRows: z.number().int(),
  invalidRows: z.number().int(),
  duplicateRows: z.number().int(),
  rows: z.array(importRowResultSchema),
  /** True when rows were truncated for display. */
  truncated: z.boolean(),
});
export type ImportPreviewResponse = z.infer<typeof importPreviewResponseSchema>;

export const importCommitResponseSchema = z.object({
  type: z.enum(IMPORT_TYPES),
  imported: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
  rows: z.array(importRowResultSchema),
  truncated: z.boolean(),
});
export type ImportCommitResponse = z.infer<typeof importCommitResponseSchema>;

/* ------------------------------------------------------------------ */
/* Data export                                                         */
/* ------------------------------------------------------------------ */

export const EXPORT_ENTITIES = [
  "patients",
  "cases",
  "implants",
  "payments",
  "charges",
  "discounts",
  "followups",
  "communications",
] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

export const EXPORT_ENTITY_LABELS: Record<ExportEntity, string> = {
  patients: "المرضى",
  cases: "حالات الزراعة",
  implants: "الزرعات",
  payments: "الدفعات",
  charges: "الرسوم الإضافية",
  discounts: "الخصومات",
  followups: "المتابعات",
  communications: "سجل التواصل",
};
