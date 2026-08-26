import { z } from "zod";
import {
  emailSchema,
  localeSchema,
  passwordSchema,
  tenantStatusSchema,
} from "./auth";
import { normalizeMobile } from "../phone";

const nameSchema = z.string().trim().min(2).max(200);
const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/);

const optionalEmailSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? undefined : value,
  emailSchema.optional(),
);
const phoneSchema = z.string().transform((value, ctx) => {
  const result = normalizeMobile(value);
  if (!result.ok) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: result.message });
    return z.NEVER;
  }
  return result.normalized;
});

export const publicRegistrationInputSchema = z.object({
  tenantName: nameSchema,
  legalName: z.string().trim().max(200).optional(),
  ownerName: nameSchema,
  username: usernameSchema,
  phone: phoneSchema,
  city: z.string().trim().max(120).optional(),
  email: optionalEmailSchema,
  password: passwordSchema,
  confirmPassword: z.string(),
  locale: localeSchema,
}).refine((value) => value.password === value.confirmPassword, {
  message: "كلمتا المرور غير متطابقتين.",
  path: ["confirmPassword"],
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
export const activationWorkflowStatusSchema = z.enum([
  "NEW",
  "CONTACTED",
  "AWAITING_PAYMENT",
  "PAYMENT_RECEIVED",
  "ACTIVATED",
  "CLOSED",
]);
export type ActivationWorkflowStatus = z.infer<
  typeof activationWorkflowStatusSchema
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
  support: z.object({
    email: z.string().nullable(),
    phone: z.string().nullable(),
    whatsapp: z.string().nullable(),
  }),
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
  workflowStatus: activationWorkflowStatusSchema,
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
  status: z.enum([
    "PENDING_VERIFICATION",
    "TRIAL",
    "ACTIVE",
    "SUSPENDED",
    "EXPIRED",
  ]).optional(),
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
  contactName: z.string().nullable(),
  contactEmail: z.string().nullable(),
  contactPhone: z.string().nullable(),
  city: z.string().nullable(),
  locale: localeSchema,
  isInternal: z.boolean(),
  status: tenantStatusSchema,
  trialStartedAt: z.string().nullable(),
  trialEndsAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  suspendedAt: z.string().nullable(),
  createdAt: z.string(),
  lastActivityAt: z.string().nullable(),
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
  users: z.array(z.object({
    id: z.string().uuid(),
    fullName: z.string(),
    username: z.string(),
    role: z.enum(["ADMIN", "DOCTOR", "ASSISTANT"]),
    isActive: z.boolean(),
    lastLoginAt: z.string().nullable(),
  })),
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

export const platformOverviewSchema = z.object({
  metrics: z.object({
    totalCustomers: z.number().int(),
    activeCustomers: z.number().int(),
    trialCustomers: z.number().int(),
    expiringTrials: z.number().int(),
    expiredTrials: z.number().int(),
    suspendedCustomers: z.number().int(),
    newToday: z.number().int(),
    newThisMonth: z.number().int(),
    openActivationRequests: z.number().int(),
    openSystemErrors: z.number().int(),
  }),
  registrations: z.array(z.object({ bucket: z.string(), count: z.number().int() })),
  statusDistribution: z.array(z.object({ status: z.string(), count: z.number().int() })),
  expiringTrials: z.array(platformTenantSchema),
  recentActivationRequests: z.array(z.object({
    request: activationRequestSchema,
    tenant: platformTenantSchema,
  })),
  recentErrors: z.array(z.object({
    id: z.string().uuid(),
    referenceCode: z.string(),
    tenantName: z.string().nullable(),
    errorType: z.string(),
    safeMessage: z.string(),
    isResolved: z.boolean(),
    occurredAt: z.string(),
  })),
  recentActivity: z.array(z.object({
    id: z.string().uuid(),
    actor: z.string().nullable(),
    action: z.string(),
    tenantName: z.string().nullable(),
    reference: z.string().nullable(),
    summary: z.string().nullable(),
    createdAt: z.string(),
  })),
  environment: z.object({ name: z.string(), version: z.string() }),
});
export type PlatformOverview = z.infer<typeof platformOverviewSchema>;

export const platformTrialsInputSchema = z.object({
  view: z.enum(["active", "expiring", "expired", "extended"]).default("active"),
  query: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PlatformTrialsInput = z.infer<typeof platformTrialsInputSchema>;
export type PlatformTrialsResponse = PlatformTenantListResponse;

export const platformActivationRequestsInputSchema = z.object({
  workflowStatus: activationWorkflowStatusSchema.optional(),
  query: z.string().trim().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PlatformActivationRequestsInput = z.infer<
  typeof platformActivationRequestsInputSchema
>;
export const platformActivationRequestItemSchema = z.object({
  request: activationRequestSchema,
  tenant: platformTenantSchema,
});
export type PlatformActivationRequestItem = z.infer<
  typeof platformActivationRequestItemSchema
>;
export type PlatformActivationRequestsResponse = {
  items: PlatformActivationRequestItem[];
  total: number;
  page: number;
  limit: number;
};
export const updateActivationWorkflowInputSchema = z.object({
  workflowStatus: activationWorkflowStatusSchema,
  note: z.string().trim().max(2_000).optional(),
});
export type UpdateActivationWorkflowInput = z.infer<
  typeof updateActivationWorkflowInputSchema
>;

export const platformErrorsInputSchema = z.object({
  query: z.string().trim().max(200).optional(),
  tenantId: z.string().uuid().optional(),
  status: z.enum(["open", "resolved"]).optional(),
  errorType: z.string().trim().max(120).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PlatformErrorsInput = z.infer<typeof platformErrorsInputSchema>;
export type PlatformSystemError = {
  id: string;
  referenceCode: string;
  tenantId: string | null;
  tenantName: string | null;
  username: string | null;
  route: string;
  method: string;
  errorType: string;
  safeMessage: string;
  environment: string;
  applicationVersion: string;
  isResolved: boolean;
  resolutionNote: string | null;
  occurredAt: string;
  resolvedAt: string | null;
};
export type PlatformErrorsResponse = {
  items: PlatformSystemError[];
  total: number;
  page: number;
  limit: number;
  errorTypes: string[];
};
export const resolvePlatformErrorInputSchema = z.object({
  resolved: z.boolean(),
  note: z.string().trim().max(2_000).optional(),
});
export type ResolvePlatformErrorInput = z.infer<
  typeof resolvePlatformErrorInputSchema
>;

export type PlatformHealthComponent = {
  status: "healthy" | "warning" | "unavailable";
  messageCode: string;
  value?: number;
  latencyMs?: number;
};
export type PlatformHealth = {
  overall: "healthy" | "warning" | "unavailable";
  checkedAt: string;
  environment: string;
  applicationVersion: string;
  components: Record<string, PlatformHealthComponent>;
};

export const platformAuditInputSchema = z.object({
  actor: z.string().trim().max(200).optional(),
  action: z.string().trim().max(200).optional(),
  tenantId: z.string().uuid().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type PlatformAuditInput = z.infer<typeof platformAuditInputSchema>;
export type PlatformAuditEntry = {
  id: string;
  actor: string | null;
  action: string;
  tenantId: string | null;
  tenantName: string | null;
  reference: string | null;
  summary: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
export type PlatformAuditResponse = {
  items: PlatformAuditEntry[];
  total: number;
  page: number;
  limit: number;
  actions: string[];
};

export const platformSettingsSchema = z.object({
  supportWhatsapp: z.string().nullable(),
  supportPhone: z.string().nullable(),
  supportEmail: z.string().email().nullable(),
  defaultTrialHours: z.number().int().min(1).max(720),
  updatedAt: z.string().nullable(),
});
export type PlatformSettings = z.infer<typeof platformSettingsSchema>;
const nullableContactNumberSchema = z.preprocess(
  (value) => typeof value === "string" && value.trim() === "" ? null : value,
  z.string()
    .trim()
    .min(7)
    .max(24)
    .regex(/^\+?[0-9 ()-]+$/)
    .nullable(),
);

export const updatePlatformSettingsInputSchema = z.object({
  supportWhatsapp: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    phoneSchema.nullable(),
  ),
  supportPhone: nullableContactNumberSchema,
  supportEmail: z.preprocess(
    (value) => value === "" ? null : value,
    z.string().email().nullable(),
  ),
  defaultTrialHours: z.number().int().min(1).max(720),
});
export type UpdatePlatformSettingsInput = z.infer<
  typeof updatePlatformSettingsInputSchema
>;