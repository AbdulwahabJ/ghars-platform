import { z } from "zod";

export const PATIENT_STATUSES = ["active", "archived"] as const;
export const patientStatusSchema = z.enum(PATIENT_STATUSES);
export type PatientStatus = z.infer<typeof patientStatusSchema>;

export const patientSchema = z.object({
  id: z.string().uuid(),
  fileNumber: z.string(),
  fullName: z.string(),
  mobileNumber: z.string().nullable(),
  mobileNormalized: z.string().nullable(),
  age: z.number().int().nullable(),
  administrativeNote: z.string().nullable(),
  status: patientStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type Patient = z.infer<typeof patientSchema>;

export const patientInputSchema = z.object({
  fileNumber: z
    .string()
    .trim()
    .min(1, "رقم الملف مطلوب.")
    .max(50, "رقم الملف طويل جدًا."),
  fullName: z
    .string()
    .trim()
    .min(1, "اسم المريض مطلوب.")
    .max(200, "اسم المريض طويل جدًا."),
  mobileNumber: z
    .string()
    .trim()
    .max(30, "رقم الجوال طويل جدًا.")
    .nullish()
    .transform((v) => (v ? v : null)),
  age: z
    .number()
    .int("العمر يجب أن يكون رقمًا صحيحًا.")
    .min(0, "العمر غير صحيح.")
    .max(130, "العمر غير صحيح.")
    .nullish()
    .transform((v) => (v == null ? null : v)),
  administrativeNote: z
    .string()
    .trim()
    .max(2000, "الملاحظة طويلة جدًا.")
    .nullish()
    .transform((v) => (v ? v : null)),
});
export type PatientInput = z.infer<typeof patientInputSchema>;

export const patientUpdateSchema = patientInputSchema.partial();
export type PatientUpdate = z.infer<typeof patientUpdateSchema>;

export const patientListQuerySchema = z.object({
  query: z.string().trim().max(200).optional(),
  status: z.enum(["active", "archived", "all"]).default("active"),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PatientListQuery = z.input<typeof patientListQuerySchema>;

export const patientListResponseSchema = z.object({
  items: z.array(patientSchema),
  total: z.number().int(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type PatientListResponse = z.infer<typeof patientListResponseSchema>;

export const patientBulkActionSchema = z.object({
  patientIds: z.array(z.string().uuid()).min(1).max(100),
  action: z.enum(["archive", "restore"]),
  preview: z.boolean().default(false),
});
export type PatientBulkAction = z.input<typeof patientBulkActionSchema>;

export const patientBulkImpactSchema = z.object({
  patients: z.number().int().nonnegative(),
  cases: z.number().int().nonnegative(),
  implants: z.number().int().nonnegative(),
  payments: z.number().int().nonnegative(),
  followups: z.number().int().nonnegative(),
  prostheticEvents: z.number().int().nonnegative(),
});
export type PatientBulkImpact = z.infer<typeof patientBulkImpactSchema>;

export const patientBulkActionResponseSchema = z.object({
  action: z.enum(["archive", "restore"]),
  preview: z.boolean(),
  affected: z.number().int().nonnegative(),
  patientIds: z.array(z.string().uuid()),
  impact: patientBulkImpactSchema,
});
export type PatientBulkActionResponse = z.infer<typeof patientBulkActionResponseSchema>;

export const FILE_NUMBER_CHECK_STATUSES = [
  "available",
  "active",
  "archived",
] as const;
export const fileNumberCheckResponseSchema = z.object({
  status: z.enum(FILE_NUMBER_CHECK_STATUSES),
  patientId: z.string().uuid().optional(),
  fullName: z.string().optional(),
});
export type FileNumberCheckResponse = z.infer<
  typeof fileNumberCheckResponseSchema
>;

/** Error codes returned with HTTP 409 on duplicate file numbers. */
export const DUPLICATE_ACTIVE = "DUPLICATE_ACTIVE";
export const DUPLICATE_ARCHIVED = "DUPLICATE_ARCHIVED";
