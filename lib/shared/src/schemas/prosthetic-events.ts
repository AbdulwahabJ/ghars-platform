import { z } from "zod";

export const PROSTHETIC_EVENT_TYPES = [
  "تركيب مؤقت",
  "تركيب دائم",
] as const;
export const prostheticEventTypeSchema = z.enum(PROSTHETIC_EVENT_TYPES);
export type ProstheticEventType = z.infer<typeof prostheticEventTypeSchema>;

export const IMPLANT_STATUS_BY_PROSTHETIC_EVENT = {
  "تركيب مؤقت": "تم تركيب مؤقت",
  "تركيب دائم": "تم التركيب",
} as const;

export const PROSTHETIC_EVENT_TYPE_BY_IMPLANT_STATUS = {
  "تم تركيب مؤقت": "تركيب مؤقت",
  "تم التركيب": "تركيب دائم",
} as const;

const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "صيغة التاريخ غير صحيحة.")
  .refine((value) => {
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  }, "التاريخ غير موجود في التقويم.");

export const prostheticEventSchema = z.object({
  id: z.string().uuid(),
  implantCaseId: z.string().uuid(),
  implantId: z.string().uuid().nullable(),
  eventType: prostheticEventTypeSchema,
  eventDate: isoDateSchema,
  note: z.string().nullable(),
  status: z.enum(["active", "archived"]),
  createdAt: z.string(),
  archivedAt: z.string().nullable(),
});
export type ProstheticEvent = z.infer<typeof prostheticEventSchema>;

export const prostheticEventInputSchema = z.object({
  implantId: z
    .string()
    .uuid("معرّف الزرعة غير صحيح.")
    .nullish()
    .transform((value) => value ?? null),
  eventType: prostheticEventTypeSchema,
  eventDate: isoDateSchema,
  note: z
    .string()
    .trim()
    .max(1000, "ملاحظة التركيب طويلة جدًا.")
    .nullish()
    .transform((value) => (value ? value : null)),
});
export type ProstheticEventInput = z.infer<
  typeof prostheticEventInputSchema
>;

export const PROSTHETIC_EVENT_NOT_FOUND = "PROSTHETIC_EVENT_NOT_FOUND";