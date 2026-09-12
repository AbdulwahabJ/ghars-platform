import { z } from "zod";

export const landingMediaTypeSchema = z.enum(["HERO", "GALLERY"]);
export type LandingMediaType = z.infer<typeof landingMediaTypeSchema>;

export const landingMediaSourceTypeSchema = z.enum(["STATIC", "OBJECT"]);
export type LandingMediaSourceType = z.infer<typeof landingMediaSourceTypeSchema>;

export const landingImageMimeTypeSchema = z.enum(["image/png", "image/jpeg", "image/webp"]);
export type LandingImageMimeType = z.infer<typeof landingImageMimeTypeSchema>;

export const LANDING_MEDIA_MAX_BYTES = 10 * 1024 * 1024;

const bilingualTitle = z.string().trim().min(1, "العنوان مطلوب.").max(240, "العنوان طويل جدًا.");
const bilingualDescription = z.string().trim().max(1000, "الوصف طويل جدًا.").nullable().optional();

export const landingMediaSchema = z.object({
  id: z.string().uuid(),
  titleAr: z.string(),
  titleEn: z.string(),
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  mediaType: landingMediaTypeSchema,
  sortOrder: z.number().int(),
  isActive: z.boolean(),
  sourceType: landingMediaSourceTypeSchema,
  fileRef: z.string(),
  mimeType: landingImageMimeTypeSchema.nullable(),
  sizeBytes: z.number().int().nonnegative().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type LandingMediaAdmin = z.infer<typeof landingMediaSchema>;

/** Deliberately excludes storage metadata and timestamps from public output. */
export const landingMediaPublicSchema = z.object({
  id: z.string().uuid(),
  titleAr: z.string(),
  titleEn: z.string(),
  descriptionAr: z.string().nullable(),
  descriptionEn: z.string().nullable(),
  mediaType: landingMediaTypeSchema,
  sortOrder: z.number().int(),
  fileRef: z.string(),
});
export type LandingMediaPublic = z.infer<typeof landingMediaPublicSchema>;

export const landingMediaPublicResponseSchema = z.object({
  hero: landingMediaPublicSchema.nullable(),
  gallery: z.array(landingMediaPublicSchema),
});
export type LandingMediaPublicResponse = z.infer<typeof landingMediaPublicResponseSchema>;

export const landingMediaAdminResponseSchema = z.object({
  media: z.array(landingMediaSchema),
});
export type LandingMediaAdminResponse = z.infer<typeof landingMediaAdminResponseSchema>;

export const landingMediaUploadInputSchema = z.object({
  name: z.string().trim().min(1, "اسم الملف مطلوب.").max(255),
  size: z.number().int().positive().max(LANDING_MEDIA_MAX_BYTES, "حجم الصورة كبير جدًا."),
  contentType: landingImageMimeTypeSchema,
});
export type LandingMediaUploadInput = z.infer<typeof landingMediaUploadInputSchema>;

const fileRef = z.string().trim().min(1, "مرجع الملف مطلوب.").max(1000);
export const landingMediaStagingRefSchema = fileRef.regex(
  /^\/objects\/landing-media-staging\/[0-9a-f-]{36}$/,
  "يجب استخدام مرجع ملف الرفع المؤقت.",
);
export const landingMediaCanonicalRefSchema = fileRef.regex(
  /^\/objects\/landing-media\/[0-9a-f-]{36}$/,
  "مرجع التخزين غير صالح.",
);

const landingMediaInputShape = z.object({
  titleAr: bilingualTitle,
  titleEn: bilingualTitle,
  descriptionAr: bilingualDescription,
  descriptionEn: bilingualDescription,
  mediaType: landingMediaTypeSchema,
  sortOrder: z.number().int().min(0).max(100000).default(0),
  isActive: z.boolean().default(true),
  sourceType: z.literal("OBJECT"),
  fileRef: landingMediaStagingRefSchema,
  mimeType: landingImageMimeTypeSchema.nullable().optional(),
  sizeBytes: z.number().int().positive().max(LANDING_MEDIA_MAX_BYTES).nullable().optional(),
});

export const createLandingMediaInputSchema = landingMediaInputShape;
export type CreateLandingMediaInput = z.infer<typeof createLandingMediaInputSchema>;

const updateLandingMediaShape = z.object({
  titleAr: bilingualTitle.optional(),
  titleEn: bilingualTitle.optional(),
  descriptionAr: bilingualDescription,
  descriptionEn: bilingualDescription,
  mediaType: landingMediaTypeSchema.optional(),
  sortOrder: z.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
}).strict("ملف الوسيط لا يمكن تغييره عبر PATCH؛ استخدم مسار الاستبدال.");
export const updateLandingMediaInputSchema = updateLandingMediaShape.refine(
  (value) => Object.keys(value).length > 0,
  "لا توجد تعديلات لإرسالها.",
);
export type UpdateLandingMediaInput = z.infer<typeof updateLandingMediaInputSchema>;

export const replaceLandingMediaInputSchema = z.object({
  sourceType: z.literal("OBJECT"),
  fileRef: landingMediaStagingRefSchema,
  mimeType: landingImageMimeTypeSchema.nullable().optional(),
  sizeBytes: z.number().int().positive().max(LANDING_MEDIA_MAX_BYTES).nullable().optional(),
});
export type ReplaceLandingMediaInput = z.infer<typeof replaceLandingMediaInputSchema>;

export const landingMediaStatusInputSchema = z.object({ isActive: z.boolean() });
export type LandingMediaStatusInput = z.infer<typeof landingMediaStatusInputSchema>;

export const reorderLandingMediaInputSchema = z.object({
  mediaType: landingMediaTypeSchema,
  orderedIds: z.array(z.string().uuid()).min(1, "قائمة الترتيب فارغة."),
});
export type ReorderLandingMediaInput = z.infer<typeof reorderLandingMediaInputSchema>;