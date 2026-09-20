import { z } from "zod";
import { emailSchema, passwordSchema, userRoleSchema } from "./auth";

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
  /** Null for legacy users that have not added a recovery email yet. */
  email: emailSchema.nullable(),
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
  mustChangePassword: z.boolean(),
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
  email: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    emailSchema.nullable(),
  ),
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
    /** null clears the recovery email for a legacy/manual-access workflow. */
    email: emailSchema.nullable().optional(),
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
  password: passwordSchema.optional(),
});
export type ResetPasswordInput = z.infer<typeof resetPasswordInputSchema>;

export const passwordResetResponseSchema = z.object({
  temporaryPassword: z.string(),
});
export type PasswordResetResponse = z.infer<typeof passwordResetResponseSchema>;

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
  systemName: "غرس | Ghars",
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
/* Universal legacy import staging                                     */
/* ------------------------------------------------------------------ */

export const UNIVERSAL_IMPORT_DESTINATIONS = [
  "patient.name",
  "patient.file_number",
  "patient.mobile",
  "patient.age",
  "case.procedure_date",
  "case.treating_doctor",
  "case.status",
  "implant.system",
  "implant.site",
  "implant.size",
  "implant.q_value",
  "implant.former_value",
  "implant.graft_value",
  "case.pros_value",
  "clinical_note",
  "finance.candidate",
  "finance.total",
  "finance.paid",
  "finance.opening_remaining",
  "finance.status",
  "finance.preserve_summary",
  "finance.ignore",
  "legacy_note",
  "ignore",
] as const;
export type UniversalImportDestination =
  (typeof UNIVERSAL_IMPORT_DESTINATIONS)[number];

export const universalImportMappingSchema = z.object({
  source: z.string().min(1).max(200),
  destination: z.enum(UNIVERSAL_IMPORT_DESTINATIONS),
  confidence: z.number().min(0).max(1),
  reason: z.string().max(500),
  requiresReview: z.boolean(),
});
export type UniversalImportMapping = z.infer<typeof universalImportMappingSchema>;

export const universalImportInputSchema = z.object({
  filename: z.string().min(1).max(255),
  mime: z.string().min(1).max(160),
  /** UTF-8 text for CSV, base64 for XLSX/PDF/images. */
  content: z.string().min(1).max(11_000_000),
  mappings: z.array(universalImportMappingSchema).optional(),
  mode: z.enum(["clinical_only", "clinical_and_verified_finance"]).default("clinical_only"),
});
export type UniversalImportInput = z.infer<typeof universalImportInputSchema>;

export const universalImportMappingPatchSchema = z.object({
  mappings: z.array(
    z.object({
      source: z.string().min(1).max(200),
      destination: z.enum(UNIVERSAL_IMPORT_DESTINATIONS),
    }),
  ).default([]),
  valueMappings: z.array(z.object({
    source: z.string().min(1).max(200),
    destination: z.string().min(1).max(200),
  })).optional(),
  rowApprovals: z.array(z.object({
    rowNumber: z.number().int().min(1),
    approved: z.boolean(),
  })).optional(),
  financeCorrections: z.array(z.object({
    rowNumber: z.number().int().min(1),
    historicalTotalAmount: z.number().int().nonnegative().nullable(),
    historicalPaidAmount: z.number().int().nonnegative().nullable(),
    openingRemainingBalance: z.number().int().nonnegative().nullable(),
    historicalPaymentStatus: z.enum(["UNKNOWN", "UNPAID", "PARTIALLY_PAID", "PAID_IN_FULL", "REVIEW_REQUIRED"]).nullable(),
    isVerified: z.boolean(),
  })).optional(),
  caseCorrections: z.array(z.object({
    rowNumber: z.number().int().min(1),
    procedureDate: z.string().date(),
    treatingDoctor: z.string().trim().min(1).max(200),
    status: z.string().trim().min(1).max(200),
  })).optional(),
  rowCorrections: z.array(z.object({
    rowNumber: z.number().int().min(1),
    patient: z.object({
      name: z.string().trim().min(1).max(300),
      fileNumber: z.string().trim().min(1).max(100),
      mobile: z.string().trim().max(50).nullable(),
      age: z.number().int().min(0).max(150).nullable(),
    }),
    case: z.object({
      procedureDate: z.string().date(),
      treatingDoctor: z.string().trim().min(1).max(200),
      status: z.string().trim().min(1).max(200),
      prosValue: z.enum(["2M", "3M"]).nullable(),
      clinicalNote: z.string().max(10_000).nullable(),
    }),
    implants: z.array(z.object({
      site: z.string().trim().min(1).max(100),
      size: z.string().trim().max(100).nullable(),
      system: z.string().trim().max(200).nullable(),
      qValue: z.string().trim().max(200).nullable(),
      formerValue: z.string().trim().max(200).nullable(),
      graftValue: z.string().trim().max(200).nullable(),
    })).min(1).max(100),
  })).optional(),
  implantApplyToAll: z.array(z.object({
    rowNumber: z.number().int().min(1),
    fields: z.array(z.enum(["qValue", "formerValue", "graftValue"])).min(1),
  })).optional(),
  version: z.number().int().min(1).optional(),
}).refine((value) => value.mappings.length > 0 || (value.valueMappings?.length ?? 0) > 0 || (value.rowApprovals?.length ?? 0) > 0 || (value.financeCorrections?.length ?? 0) > 0 || (value.caseCorrections?.length ?? 0) > 0 || (value.rowCorrections?.length ?? 0) > 0 || (value.implantApplyToAll?.length ?? 0) > 0,
  "At least one mapping, value mapping, row approval, case correction, or finance correction is required.");
export type UniversalImportMappingPatch = z.infer<typeof universalImportMappingPatchSchema>;

export const universalImportCommitSchema = z.object({
  rowNumbers: z.array(z.number().int().min(1)).optional(),
  pilot: z.boolean().default(false),
  version: z.number().int().min(1).optional(),
  mode: z.enum(["clinical_only", "clinical_and_verified_finance"]).default("clinical_only"),
});
export type UniversalImportCommit = z.infer<typeof universalImportCommitSchema>;

export const universalImportBatchStatusSchema = z.enum([
  "ANALYZED",
  "COMMITTING",
  "ROLLING_BACK",
  "PILOT_COMMITTED",
  "COMMITTED",
  "PARTIAL_FAILED",
  "ROLLED_BACK",
]);
export type UniversalImportBatchStatus = z.infer<
  typeof universalImportBatchStatusSchema
>;

export const universalImportNormalizedRowSchema = z.object({
  rowNumber: z.number().int().min(1),
  raw: z.record(z.string(), z.string()),
  status: z.enum(["READY", "REVIEW_REQUIRED", "BLOCKED", "DUPLICATE"]),
  warnings: z.array(z.string()),
  confidence: z.record(z.string(), z.number().min(0).max(1)),
  proposed: z.object({
    patient: z.object({
      name: z.string(),
      fileNumber: z.string(),
      mobile: z.string().nullable(),
      age: z.number().nullable(),
    }),
    case: z.object({
      procedureDate: z.string(),
      treatingDoctor: z.string(),
      status: z.string(),
      prosValue: z.string().nullable(),
      clinicalNote: z.string().nullable(),
    }),
    implants: z.array(z.object({
      site: z.string(),
      size: z.string().nullable(),
      system: z.string().nullable(),
      qValue: z.string().nullable(),
      formerValue: z.string().nullable(),
      graftValue: z.string().nullable(),
    })),
    implantApplyToAll: z.array(z.enum(["qValue", "formerValue", "graftValue"])),
    sourceCandidates: z.object({
      qValue: z.string().nullable(),
      formerValue: z.string().nullable(),
      graftValue: z.string().nullable(),
    }),
    financeCandidate: z.string().nullable(),
    finance: z.object({
      historicalTotalAmount: z.number().int().nonnegative().nullable(),
      historicalPaidAmount: z.number().int().nonnegative().nullable(),
      openingRemainingBalance: z.number().int().nonnegative().nullable(),
      historicalPaymentStatus: z.enum(["UNKNOWN", "UNPAID", "PARTIALLY_PAID", "PAID_IN_FULL", "REVIEW_REQUIRED"]).nullable(),
      isVerified: z.boolean(),
    }),
    legacyNotes: z.array(z.string()),
  }),
  importPlan: z.object({
    createPatient: z.boolean(),
    createCase: z.boolean(),
    implantCount: z.number().int().nonnegative(),
    createBoneGraftProcedure: z.literal(false),
    createProstheticEvent: z.literal(false),
    paymentRecords: z.literal(0),
    historicalFinanceEligible: z.boolean(),
    preserveLegacyNote: z.boolean(),
    openingRemainingBalance: z.number().int().nonnegative().nullable(),
    implants: z.array(z.object({
      site: z.string(),
      size: z.string().nullable(),
      system: z.string().nullable(),
      qValue: z.string().nullable(),
      formerValue: z.string().nullable(),
      graftValue: z.string().nullable(),
    })),
    prosValue: z.string().nullable(),
  }),
});
export type UniversalImportNormalizedRow = z.infer<
  typeof universalImportNormalizedRowSchema
>;

export const universalImportSummarySchema = z.object({
  totalRows: z.number().int().min(0),
  ready: z.number().int().min(0),
  reviewRequired: z.number().int().min(0),
  blocked: z.number().int().min(0),
  duplicate: z.number().int().min(0),
  patients: z.number().int().min(0),
  implants: z.number().int().min(0),
  committedRows: z.number().int().min(0).optional(),
  pilot: z.boolean().optional(),
  partial: z.boolean().optional(),
  approvedRows: z.array(z.number().int().min(1)).optional(),
  pagesProcessed: z.number().int().min(1).optional(),
  documentType: z.enum(["TEXT", "IMAGE", "MIXED"]).optional(),
  extractionReview: z.string().optional(),
  importMode: z.enum(["clinical_only", "clinical_and_verified_finance"]).optional(),
});
export type UniversalImportSummary = z.infer<typeof universalImportSummarySchema>;

export const universalImportBatchSchema = z.object({
  id: z.string().uuid(),
  filename: z.string(),
  mime: z.string(),
  status: universalImportBatchStatusSchema,
  version: z.number().int().min(1),
  mappings: z.array(universalImportMappingSchema),
  rows: z.array(universalImportNormalizedRowSchema),
  summary: universalImportSummarySchema,
  createdRecords: z.array(z.object({
    table: z.string(),
    id: z.string().uuid(),
    patientId: z.string().uuid().optional(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })),
  committedRowNumbers: z.array(z.number().int().min(1)),
});
export type UniversalImportBatch = z.infer<typeof universalImportBatchSchema>;

export const universalImportCommitResponseSchema = z.object({
  batch: universalImportBatchSchema,
  importedRows: z.number().int().min(0),
  createdRecords: z.number().int().min(0),
});
export type UniversalImportCommitResponse = z.infer<
  typeof universalImportCommitResponseSchema
>;

export const universalImportPartialFailureResponseSchema = z.object({
  error: z.string(),
  batch: universalImportBatchSchema,
  committedGroups: z.number().int().min(0),
  committedRows: z.number().int().min(0),
});
export type UniversalImportPartialFailureResponse = z.infer<
  typeof universalImportPartialFailureResponseSchema
>;

export const universalImportRollbackResponseSchema = z.object({
  batch: universalImportBatchSchema,
  rolledBack: z.literal(true),
});
export type UniversalImportRollbackResponse = z.infer<
  typeof universalImportRollbackResponseSchema
>;

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
