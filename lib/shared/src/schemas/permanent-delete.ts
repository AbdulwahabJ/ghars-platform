import { z } from "zod";

export const permanentCaseDeleteRequestSchema = z.object({
  caseIds: z.array(z.string().uuid()).min(1),
  preview: z.boolean(),
  confirmed: z.boolean().optional(),
  previewToken: z.string().optional(),
});
export type PermanentCaseDeleteRequest = z.infer<typeof permanentCaseDeleteRequestSchema>;

export const permanentPatientDeleteRequestSchema = z.object({
  preview: z.boolean(),
  confirmed: z.boolean().optional(),
  previewToken: z.string().optional(),
});
export type PermanentPatientDeleteRequest = z.infer<typeof permanentPatientDeleteRequestSchema>;
export const permanentDeletePreviewResponseSchema = z.object({
  preview: z.literal(true),
  previewToken: z.string(),
  impact: z.record(z.string(), z.number()),
  importBatchContext: z.array(z.record(z.string(), z.unknown())),
});