import { z } from "zod";

/**
 * Phase 4 — follow-ups, WhatsApp templates, and the communication log.
 * All lists carry the exact Arabic values from the specification.
 */

export const FOLLOWUP_TYPES = [
  "متابعة بعد العملية",
  "تقييم ثبات الزرعة",
  "أشعة",
  "جاهزية للتركيب",
  "موعد تركيب",
  "متابعة المؤقت",
  "تحويل المؤقت إلى دائم",
  "متابعة زراعة العظم",
  "متابعة رفع الجيب الأنفي",
  "متابعة زرعة فاشلة",
  "إعادة زراعة",
  "متابعة مالية",
  "تواصل عام",
  "أخرى",
] as const;
export type FollowupType = (typeof FOLLOWUP_TYPES)[number];

export const FOLLOWUP_STATUSES = [
  "مجدولة",
  "تمت",
  "لم يحضر",
  "مؤجلة",
  "لا يوجد رد",
  "تحتاج إعادة تواصل",
  "ملغاة",
] as const;
export type FollowupStatus = (typeof FOLLOWUP_STATUSES)[number];

/** The only status that counts as an open appointment (today / overdue). */
export const OPEN_FOLLOWUP_STATUS = "مجدولة" as const;
/** Statuses that close a follow-up entirely (never a contact task). */
export const CLOSED_FOLLOWUP_STATUSES = ["تمت", "ملغاة", "مؤجلة"] as const;
/** Case status that marks a case as ready for treatment. */
export const READY_CASE_STATUS = "جاهز للتركيب" as const;

/** Outcome statuses a user can record on an existing follow-up. */
export const FOLLOWUP_OUTCOME_STATUSES = [
  "تمت",
  "لم يحضر",
  "لا يوجد رد",
  "تحتاج إعادة تواصل",
  "ملغاة",
] as const;

export const COMMUNICATION_RESULTS = [
  "تم فتح واتساب",
  "تم التواصل",
  "لا يوجد رد",
  "أكد الموعد",
  "طلب تغيير الموعد",
  "سيتم التواصل لاحقًا",
  "رقم غير صحيح",
] as const;
export type CommunicationResult = (typeof COMMUNICATION_RESULTS)[number];

export const COMMUNICATION_REASONS = [
  "تذكير بالموعد",
  "متابعة زراعة",
  "استكمال العلاج",
  "موعد فائت",
  "متابعة بعد الإجراء",
  "تذكير مالي عام",
  "تواصل عام",
] as const;

/**
 * Riyadh is fixed UTC+03:00 (no DST). Local date-time inputs from the UI
 * ("YYYY-MM-DDTHH:mm") are anchored to that offset before storage so the
 * stored timestamptz always represents clinic wall-clock time.
 */
const RIYADH_OFFSET = "+03:00";

const riyadhDateTimeSchema = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/,
    "صيغة التاريخ والوقت غير صحيحة",
  )
  .transform((v) => `${v}:00${RIYADH_OFFSET}`);

const riyadhDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة")
  .transform((v) => `${v}T00:00:00${RIYADH_OFFSET}`);

const noteSchema = z
  .string()
  .trim()
  .max(2000, "النص طويل جدًا")
  .nullish()
  .transform((v) => (v ? v : null));

export const followupInputSchema = z.object({
  followupType: z.enum(FOLLOWUP_TYPES),
  scheduledAt: riyadhDateTimeSchema,
  requiresContact: z.boolean().default(false),
  contactDueAt: riyadhDateSchema.nullish().transform((v) => v ?? null),
  nextAppointmentAt: riyadhDateTimeSchema
    .nullish()
    .transform((v) => v ?? null),
  note: noteSchema,
  assignedUserId: z.string().uuid().nullish().transform((v) => v ?? null),
});
export type FollowupInput = z.infer<typeof followupInputSchema>;

export const followupUpdateSchema = z.object({
  followupType: z.enum(FOLLOWUP_TYPES).optional(),
  scheduledAt: riyadhDateTimeSchema.optional(),
  requiresContact: z.boolean().optional(),
  contactDueAt: riyadhDateSchema.nullish().optional(),
  nextAppointmentAt: riyadhDateTimeSchema.nullish().optional(),
  note: noteSchema.optional(),
  assignedUserId: z.string().uuid().nullish().optional(),
});
export type FollowupUpdate = z.infer<typeof followupUpdateSchema>;

/** Record an outcome (complete / no-show / no-response / needs re-contact / cancel). */
export const followupOutcomeSchema = z.object({
  status: z.enum(FOLLOWUP_OUTCOME_STATUSES),
  result: noteSchema,
  note: noteSchema,
});
export type FollowupOutcome = z.infer<typeof followupOutcomeSchema>;

/**
 * Postponing closes the current record with status "مؤجلة" (history is
 * preserved) and creates a fresh scheduled follow-up on the new date.
 */
export const followupPostponeSchema = z.object({
  newScheduledAt: riyadhDateTimeSchema,
  note: noteSchema,
});
export type FollowupPostpone = z.infer<typeof followupPostponeSchema>;

export const communicationInputSchema = z.object({
  implantCaseId: z.string().uuid().nullish().transform((v) => v ?? null),
  templateId: z.string().uuid().nullish().transform((v) => v ?? null),
  communicationReason: z
    .string()
    .trim()
    .min(1, "سبب التواصل مطلوب")
    .max(200, "سبب التواصل طويل جدًا"),
  renderedMessage: z
    .string()
    .trim()
    .min(1, "نص الرسالة مطلوب")
    .max(4000, "نص الرسالة طويل جدًا"),
});
export type CommunicationInput = z.infer<typeof communicationInputSchema>;

export const communicationResultInputSchema = z.object({
  communicationResult: z.enum(COMMUNICATION_RESULTS),
  resultNote: noteSchema,
});
export type CommunicationResultInput = z.infer<
  typeof communicationResultInputSchema
>;

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

export const followupSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  patientId: z.string().uuid(),
  followupType: z.string(),
  followupStatus: z.string(),
  scheduledAt: z.string().nullable(),
  result: z.string().nullable(),
  note: z.string().nullable(),
  requiresContact: z.boolean(),
  contactDueAt: z.string().nullable(),
  nextAppointmentAt: z.string().nullable(),
  assignedUserId: z.string().uuid().nullable(),
  assignedUserName: z.string().nullable(),
  createdByName: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Followup = z.infer<typeof followupSchema>;

export const communicationSchema = z.object({
  id: z.string().uuid(),
  patientId: z.string().uuid(),
  implantCaseId: z.string().uuid().nullable(),
  templateId: z.string().uuid().nullable(),
  templateName: z.string().nullable(),
  communicationReason: z.string().nullable(),
  renderedMessage: z.string().nullable(),
  openedAt: z.string().nullable(),
  communicationResult: z.string().nullable(),
  resultNote: z.string().nullable(),
  userName: z.string().nullable(),
  createdAt: z.string(),
});
export type Communication = z.infer<typeof communicationSchema>;

export const whatsappTemplateSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  body: z.string(),
  sortOrder: z.number(),
});
export type WhatsappTemplate = z.infer<typeof whatsappTemplateSchema>;

export const NOTIFICATION_KINDS = [
  "due_today",
  "overdue",
  "contact_due",
  "ready_case",
] as const;

export const notificationItemSchema = z.object({
  kind: z.enum(NOTIFICATION_KINDS),
  patientId: z.string().uuid(),
  patientName: z.string(),
  reason: z.string(),
  dueAt: z.string().nullable(),
  followupId: z.string().uuid().nullable(),
  implantCaseId: z.string().uuid().nullable(),
});
export type NotificationItem = z.infer<typeof notificationItemSchema>;

export const notificationsResponseSchema = z.object({
  items: z.array(notificationItemSchema),
  totalCount: z.number(),
});
export type NotificationsResponse = z.infer<
  typeof notificationsResponseSchema
>;

// ---------------------------------------------------------------------------
// Structured classification rules (shared so backend and tests agree)
// ---------------------------------------------------------------------------

/** Riyadh calendar date ("YYYY-MM-DD") of a timestamp. */
export function riyadhDateOf(iso: string | Date): string {
  const d = typeof iso === "string" ? new Date(iso) : iso;
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

export type FollowupBucket = "today" | "overdue" | "upcoming" | null;

/**
 * Classify an open appointment relative to "now".
 * Only "مجدولة" records count; completed, cancelled, postponed, and recorded
 * outcomes (لم يحضر / لا يوجد رد / تحتاج إعادة تواصل) are never overdue.
 */
export function classifyFollowup(
  followup: { followupStatus: string; scheduledAt: string | null },
  now: Date,
): FollowupBucket {
  if (followup.followupStatus !== OPEN_FOLLOWUP_STATUS) return null;
  if (!followup.scheduledAt) return null;
  const scheduledDay = riyadhDateOf(followup.scheduledAt);
  const today = riyadhDateOf(now);
  if (scheduledDay === today) return "today";
  return scheduledDay < today ? "overdue" : "upcoming";
}

/**
 * A contact task: requires contact, has a due date that has arrived (Riyadh
 * calendar), and the record is not closed.
 */
export function isContactTaskDue(
  followup: {
    followupStatus: string;
    requiresContact: boolean;
    contactDueAt: string | null;
  },
  now: Date,
): boolean {
  if (!followup.requiresContact || !followup.contactDueAt) return false;
  if (
    (CLOSED_FOLLOWUP_STATUSES as readonly string[]).includes(
      followup.followupStatus,
    )
  ) {
    return false;
  }
  return riyadhDateOf(followup.contactDueAt) <= riyadhDateOf(now);
}

/** Render a template body with the placeholder values the app knows. */
export function renderTemplate(
  body: string,
  values: { patientName: string; date?: string; time?: string },
): string {
  return body
    .replaceAll("{{patientName}}", values.patientName)
    .replaceAll("{{date}}", values.date ?? "____")
    .replaceAll("{{time}}", values.time ?? "____");
}

/** Build the WhatsApp deep link for a normalized number + message. */
export function buildWhatsappLink(
  normalizedNumber: string,
  message: string,
): string {
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(message)}`;
}

export const FOLLOWUP_ERROR_CODES = [
  "FOLLOWUP_NOT_FOUND",
  "FOLLOWUP_CLOSED",
  "TEMPLATE_NOT_FOUND",
  "COMMUNICATION_NOT_FOUND",
] as const;
