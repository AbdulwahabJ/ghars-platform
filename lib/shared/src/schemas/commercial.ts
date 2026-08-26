import { z } from "zod";
import {
  emailSchema,
  localeSchema,
  passwordSchema,
  tenantStatusSchema,
} from "./auth";

const nameSchema = z.string().trim().min(2).max(200);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/);

export const publicRegistrationInputSchema = z.object({
  tenantName: nameSchema,
  legalName: z.string().trim().max(200).optional(),
  ownerName: nameSchema,
  username: usernameSchema,
  email: emailSchema,
  password: passwordSchema,
  locale: localeSchema,
});
export type PublicRegistrationInput = z.infer<typeof publicRegistrationInputSchema>;
export const publicRegistrationResponseSchema = z.object({
  message: z.string(),
});
export type PublicRegistrationResponse = z.infer<
  typeof publicRegistrationResponseSchema
>;

export const emailVerificationInputSchema = z.object({
  token: z.string().min(32).max(256),
});
export type EmailVerificationInput = z.infer<typeof emailVerificationInputSchema>;
export const emailVerificationResponseSchema = z.object({
  verified: z.boolean(),
  trialEndsAt: z.string(),
});
export type EmailVerificationResponse = z.infer<
  typeof emailVerificationResponseSchema
>;

export const resendVerificationInputSchema = z.object({ email: emailSchema });
export type ResendVerificationInput = z.infer<typeof resendVerificationInputSchema>;
export const resendVerificationResponseSchema = z.object({ message: z.string() });
export type ResendVerificationResponse = z.infer<
  typeof resendVerificationResponseSchema
>;

export const activationRequestStatusSchema = z.enum([
  "PENDING",
  "APPROVED",
  "REJECTED",
]);
export type ActivationRequestStatus = z.infer<
  typeof activationRequestStatusSchema
>;

export const commercialStatusSchema = z.object({
  tenant: z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: tenantStatusSchema,
    trialStartedAt: z.string().nullable(),
    trialEndsAt: z.string().nullable(),
    activatedAt: z.string().nullable(),
    suspendedAt: z.string().nullable(),
  }),
  activationRequest: z
    .object({
      id: z.string().uuid(),
      status: activationRequestStatusSchema,
      note: z.string().nullable(),
      createdAt: z.string(),
      resolvedAt: z.string().nullable(),
    })
    .nullable(),
  support: z.object({ email: z.string().nullable(), phone: z.string().nullable() }),
});
export type CommercialStatus = z.infer<typeof commercialStatusSchema>;

export const createActivationRequestInputSchema = z.object({
  note: z.string().trim().min(1).max(2_000).optional(),
});
export type CreateActivationRequestInput = z.infer<
  typeof createActivationRequestInputSchema
>;

export const activationRequestSchema = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  requestedByUserId: z.string().uuid(),
  status: activationRequestStatusSchema,
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedByUserId: z.string().uuid().nullable(),
});
export type ActivationRequest = z.infer<typeof activationRequestSchema>;
export const activationRequestResponseSchema = z.object({
  request: activationRequestSchema,
});
export type ActivationRequestResponse = z.infer<
  typeof activationRequestResponseSchema
>;

export const platformTenantListInputSchema = z.object({
  status: tenantStatusSchema.optional(),
  query: z.string().trim().min(1).max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PlatformTenantListInput = z.infer<
  typeof platformTenantListInputSchema
>;

export const platformTenantSchema = z.object({
  id: z.string().uuid(),
  referenceCode: z.string(),
  name: z.string(),
  contactEmail: z.string().nullable(),
  locale: localeSchema,
  status: tenantStatusSchema,
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  createdAt: z.string(),
  userCount: z.number().int().nonnegative(),
  activationRequestCount: z.number().int().nonnegative(),
});
export type PlatformTenant = z.infer<typeof platformTenantSchema>;

export const platformTenantListResponseSchema = z.object({
  items: z.array(platformTenantSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  limit: z.number().int(),
});
export type PlatformTenantListResponse = z.infer<
  typeof platformTenantListResponseSchema
>;

export const platformTenantDetailSchema = platformTenantSchema.extend({
  legalName: z.string().nullable(),
  contactName: z.string().nullable(),
  contactPhone: z.string().nullable(),
  activationRequests: z.array(activationRequestSchema),
});
export type PlatformTenantDetail = z.infer<typeof platformTenantDetailSchema>;
export const platformTenantDetailResponseSchema = z.object({
  tenant: platformTenantDetailSchema,
});
export type PlatformTenantDetailResponse = z.infer<
  typeof platformTenantDetailResponseSchema
>;

export const extendTrialInputSchema = z.object({
  days: z.number().int().min(1).max(90),
});
export type ExtendTrialInput = z.infer<typeof extendTrialInputSchema>;

export const platformTenantActionResponseSchema = z.object({
  tenant: platformTenantSchema,
});
export type PlatformTenantActionResponse = z.infer<
  typeof platformTenantActionResponseSchema
>;

export const resolveActivationRequestInputSchema = z.object({
  note: z.string().trim().max(2_000).optional(),
});
export type ResolveActivationRequestInput = z.infer<
  typeof resolveActivationRequestInputSchema
>;
export const resolveActivationRequestResponseSchema = z.object({
  request: activationRequestSchema,
});
export type ResolveActivationRequestResponse = z.infer<
  typeof resolveActivationRequestResponseSchema
>;