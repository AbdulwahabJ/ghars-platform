import { z } from "zod";
import { patientInputSchema, patientSchema } from "./patients";
import { implantCaseInputSchema, implantCaseSchema, implantInputSchema, implantSchema } from "./implants";
import {
  installmentPlanInputSchema,
  paymentInputSchema,
  paymentSchema,
} from "./finance";
import { followupInputSchema, followupSchema } from "./followups";

/* ------------------------------------------------------------------ */
/* Quick-entry — atomic one-shot workflow                               */
/* ------------------------------------------------------------------ */

/**
 * A single API call that atomically creates:
 *   patient (always)
 *   + optional implant case
 *   + optional implants (requires case)
 *   + optional base treatment amount (requires case)
 *   + optional initial payment (requires case + canRecordPayments)
 *   + optional initial follow-up (requires case)
 *
 * The backend enforces all permissions and uniqueness constraints.
 * On any failure the full transaction is rolled back.
 */
export const quickEntryInputSchema = z.object({
  patient: patientInputSchema,
  /** Omit entirely to create a patient with no case. */
  case: implantCaseInputSchema.optional(),
  /**
   * Implants to add into the new case.
   * Ignored when case is omitted.
   */
  implants: z.array(implantInputSchema).max(20).default([]),
  /**
   * Base treatment amount for the new case (SAR).
   * Ignored when case is omitted.
   */
  baseTreatmentAmount: z
    .number()
    .min(0, "المبلغ لا يمكن أن يكون سالبًا.")
    .max(9999999999.99, "المبلغ كبير جدًا.")
    .optional(),
  /**
   * Optional initial payment for the new case.
   * Ignored when case is omitted.
   * Requires canRecordPayments on the server.
   */
  initialPayment: paymentInputSchema.optional(),
  /**
   * Optional payment schedule for the new case.
   * The schedule is planning data; actual collection remains in payments.
   */
  installmentPlan: installmentPlanInputSchema.optional(),
  /**
   * Optional initial follow-up for the new case.
   * Ignored when case is omitted.
   */
  followup: followupInputSchema.optional(),
});

export type QuickEntryInput = z.infer<typeof quickEntryInputSchema>;

export const quickEntryResponseSchema = z.object({
  patient: patientSchema,
  case: implantCaseSchema.optional(),
  implants: z.array(implantSchema),
  payment: paymentSchema.optional(),
  followup: followupSchema.optional(),
});

export type QuickEntryResponse = z.infer<typeof quickEntryResponseSchema>;
