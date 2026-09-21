import { z } from "zod";

export const PATIENT_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024;
export const patientAttachmentCategorySchema = z.enum([
  "RADIOLOGY", "MEDICAL_REPORT", "CONSENT", "REFERRAL",
  "CLINICAL_IMAGE", "LAB_RESULT", "EXTERNAL_DOCUMENT", "OTHER",
]);
export type PatientAttachmentCategory = z.infer<typeof patientAttachmentCategorySchema>;
export const patientAttachmentMimeSchema = z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
export type PatientAttachmentMime = z.infer<typeof patientAttachmentMimeSchema>;
export const patientAttachmentMetadataSchema = z.object({
  title: z.string().trim().max(240).nullable().optional(),
  category: patientAttachmentCategorySchema.nullable().optional(),
  note: z.string().trim().max(4000).nullable().optional(),
  fileDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "يجب أن يكون التاريخ بصيغة YYYY-MM-DD.").nullable().optional(),
  implantCaseId: z.string().uuid().nullable().optional(),
});
export const patientAttachmentUploadRequestSchema = z.object({
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(PATIENT_ATTACHMENT_MAX_BYTES),
  contentType: patientAttachmentMimeSchema,
  ...patientAttachmentMetadataSchema.shape,
});
export const patientAttachmentFinalizeSchema = z.object({
  objectPath: z.string().regex(/^\/objects\/patient-attachments-staging\/[0-9a-f-]{36}$/),
  name: z.string().trim().min(1).max(255),
  size: z.number().int().positive().max(PATIENT_ATTACHMENT_MAX_BYTES),
  contentType: patientAttachmentMimeSchema,
  uploadToken: z.string().min(20),
  ...patientAttachmentMetadataSchema.shape,
}).strict();
export const patientAttachmentCancelSchema = z.object({
  objectPath: z.string().regex(/^\/objects\/patient-attachments-staging\/[0-9a-f-]{36}$/),
  uploadToken: z.string().min(20),
});
export const patientAttachmentUpdateSchema = patientAttachmentMetadataSchema
  .omit({ implantCaseId: true }).partial()
  .refine((v) => Object.keys(v).length > 0, "لا توجد تعديلات لإرسالها.");
export type PatientAttachmentMetadata = z.infer<typeof patientAttachmentMetadataSchema>;
export type PatientAttachmentUploadRequest = z.infer<typeof patientAttachmentUploadRequestSchema>;
export type PatientAttachmentFinalize = z.infer<typeof patientAttachmentFinalizeSchema>;
export type PatientAttachmentCancel = z.infer<typeof patientAttachmentCancelSchema>;
export type PatientAttachmentUpdate = z.infer<typeof patientAttachmentUpdateSchema>;