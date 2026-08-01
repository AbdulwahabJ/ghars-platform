import { z } from "zod";

/** Standard error body returned by every API endpoint on failure. */
export const apiErrorSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  patientId: z.string().uuid().optional(),
});
export type ApiErrorBody = z.infer<typeof apiErrorSchema>;

export const healthResponseSchema = z.object({
  status: z.literal("ok"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
