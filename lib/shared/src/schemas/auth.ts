import { z } from "zod";

export const USER_ROLES = ["ADMIN", "DOCTOR", "ASSISTANT"] as const;
export const userRoleSchema = z.enum(USER_ROLES);
export type UserRole = z.infer<typeof userRoleSchema>;

export const ONBOARDING_STATUSES = [
  "not_started",
  "completed",
  "skipped",
] as const;
export const onboardingStatusSchema = z.enum(ONBOARDING_STATUSES);
export type OnboardingStatus = z.infer<typeof onboardingStatusSchema>;

export const LOCALES = ["ar", "en"] as const;
export const localeSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof localeSchema>;

/** Public user shape — never includes the password hash. */
export const publicUserSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  fullName: z.string(),
  role: userRoleSchema,
  /** Effective permission (role default + user-level override applied server-side). */
  canViewFinancials: z.boolean(),
  /** Effective permission (role default + user-level override applied server-side). */
  canRecordPayments: z.boolean(),
  /** Profile photo as a base-64 data URL, or null when none is set. */
  avatarData: z.string().nullable(),
});
export type PublicUser = z.infer<typeof publicUserSchema>;

export const preferencesSchema = z.object({
  locale: localeSchema,
  onboardingStatus: onboardingStatusSchema,
  onboardingCompletedAt: z.string().nullable(),
  onboardingSkippedAt: z.string().nullable(),
});
export type Preferences = z.infer<typeof preferencesSchema>;

export const meResponseSchema = z.object({
  user: publicUserSchema,
  preferences: preferencesSchema,
});
export type MeResponse = z.infer<typeof meResponseSchema>;

export const loginInputSchema = z.object({
  username: z.string().trim().min(1, "يرجى إدخال اسم المستخدم."),
  password: z.string().min(1, "يرجى إدخال كلمة المرور."),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const emailSchema = z
  .string()
  .trim()
  .min(1, "البريد الإلكتروني مطلوب.")
  .max(254, "البريد الإلكتروني طويل جدًا.")
  .email("صيغة البريد الإلكتروني غير صحيحة.")
  .transform((value) => value.toLowerCase());

/** Password policy: at least 10 chars with letters and digits. */
export const passwordSchema = z
  .string()
  .min(10, "كلمة المرور يجب أن تتكون من 10 أحرف على الأقل.")
  .max(200, "كلمة المرور طويلة جدًا.")
  .regex(/[A-Za-z\u0621-\u064A]/, "كلمة المرور يجب أن تحتوي على حروف.")
  .regex(/\d/, "كلمة المرور يجب أن تحتوي على رقم واحد على الأقل.");

export const setupInputSchema = z.object({
  setupKey: z.string().min(1, "مفتاح الإعداد مطلوب."),
  username: z
    .string()
    .trim()
    .min(3, "اسم المستخدم يجب أن يتكون من 3 أحرف على الأقل.")
    .max(50, "اسم المستخدم طويل جدًا.")
    .regex(
      /^[a-zA-Z0-9_.-]+$/,
      "اسم المستخدم يجب أن يحتوي على أحرف إنجليزية وأرقام فقط.",
    ),
  fullName: z.string().trim().min(1, "الاسم الكامل مطلوب.").max(200),
  email: emailSchema,
  password: passwordSchema,
});
export type SetupInput = z.infer<typeof setupInputSchema>;

export const setupStatusSchema = z.object({
  setupRequired: z.boolean(),
});
export type SetupStatus = z.infer<typeof setupStatusSchema>;

export const passwordResetRequestInputSchema = z.object({
  identifier: z
    .string()
    .trim()
    .min(1, "يرجى إدخال اسم المستخدم أو البريد الإلكتروني.")
    .max(254, "القيمة المدخلة طويلة جدًا.")
    .transform((value) => value.toLowerCase()),
});
export type PasswordResetRequestInput = z.infer<
  typeof passwordResetRequestInputSchema
>;

export const completePasswordResetInputSchema = z.object({
  token: z
    .string()
    .min(32, "رابط الاستعادة غير صالح.")
    .max(256, "رابط الاستعادة غير صالح."),
  password: passwordSchema,
});
export type CompletePasswordResetInput = z.infer<
  typeof completePasswordResetInputSchema
>;

export const updatePreferencesInputSchema = z.object({
  locale: localeSchema.optional(),
  onboardingStatus: onboardingStatusSchema.optional(),
}).refine(
  (value) => value.locale !== undefined || value.onboardingStatus !== undefined,
  { message: "At least one preference must be provided." },
);
export type UpdatePreferencesInput = z.infer<
  typeof updatePreferencesInputSchema
>;
