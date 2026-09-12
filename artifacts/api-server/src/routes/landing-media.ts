import { and, asc, eq, ne } from "drizzle-orm";
import { Router, type IRouter, type Request, type Response } from "express";
import {
  db,
  landingMediaTable,
  type LandingMedia,
} from "@workspace/db";
import {
  createLandingMediaInputSchema,
  landingMediaAdminResponseSchema,
  landingMediaPublicResponseSchema,
  landingMediaStatusInputSchema,
  landingMediaUploadInputSchema,
  replaceLandingMediaInputSchema,
  reorderLandingMediaInputSchema,
  updateLandingMediaInputSchema,
  type LandingMediaSourceType,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { logger } from "../lib/logger";
import { requireAuth, requirePlatformAdmin } from "../middlewares/auth";
import { parseOrRespond } from "../lib/validation";

const router: IRouter = Router();
const storage = new ObjectStorageService();

function adminDto(row: LandingMedia) {
  return {
    ...row,
    mediaType: row.mediaType as "HERO" | "GALLERY",
    sourceType: row.sourceType as LandingMediaSourceType,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function publicDto(row: LandingMedia) {
  return {
    id: row.id,
    titleAr: row.titleAr,
    titleEn: row.titleEn,
    descriptionAr: row.descriptionAr,
    descriptionEn: row.descriptionEn,
    mediaType: row.mediaType as "HERO" | "GALLERY",
    sortOrder: row.sortOrder,
    // Static fallback paths are directly consumable by the website. Object
    // paths intentionally use the public media proxy, not a signed URL.
    fileRef: row.sourceType === "OBJECT"
      ? `/api/landing-media/${row.id}/file`
      : row.fileRef,
  };
}

function isActiveHeroConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { code?: string; constraint?: string };
  return candidate.code === "23505" &&
    (!candidate.constraint || candidate.constraint === "UQ_landing_media_active_hero");
}

async function cleanupPromotedObject(fileRef: string): Promise<void> {
  try {
    await storage.deleteObject(fileRef);
  } catch (err) {
    logger.error({ err, fileRef }, "failed to clean promoted landing media object");
  }
}

async function deactivateOtherHeroes(tx: Parameters<Parameters<typeof db.transaction>[0]>[0], exceptId?: string) {
  await tx.update(landingMediaTable).set({ isActive: false, updatedAt: new Date() }).where(and(
    eq(landingMediaTable.mediaType, "HERO"),
    eq(landingMediaTable.isActive, true),
    ...(exceptId ? [ne(landingMediaTable.id, exceptId)] : []),
  ));
}

async function cleanupObjectIfUnreferenced(fileRef: string, excludeId?: string): Promise<void> {
  const conditions = [eq(landingMediaTable.sourceType, "OBJECT"), eq(landingMediaTable.fileRef, fileRef)];
  if (excludeId) conditions.push(ne(landingMediaTable.id, excludeId));
  const [reference] = await db.select({ id: landingMediaTable.id }).from(landingMediaTable).where(and(...conditions)).limit(1);
  if (reference) return;
  try {
    await storage.deleteObject(fileRef);
  } catch (err) {
    // Database deletion has already succeeded; never turn this into a retry
    // loop that could accidentally delete a newly referenced object.
    logger.warn({ err, fileRef }, "landing media object cleanup failed");
  }
}

/* Public read: only active media, grouped and ordered for the landing page. */
router.get("/landing-media", async (_req, res): Promise<void> => {
  const rows = await db.select().from(landingMediaTable)
    .where(eq(landingMediaTable.isActive, true))
    .orderBy(asc(landingMediaTable.mediaType), asc(landingMediaTable.sortOrder), asc(landingMediaTable.createdAt));
  const body = landingMediaPublicResponseSchema.parse({
    hero: rows.find((row) => row.mediaType === "HERO") ? publicDto(rows.find((row) => row.mediaType === "HERO")!) : null,
    gallery: rows.filter((row) => row.mediaType === "GALLERY").map(publicDto),
  });
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json(body);
});

async function streamMediaFile(
  req: Request,
  res: Response,
  allowInactive: boolean,
): Promise<void> {
  const [row] = await db.select().from(landingMediaTable).where(and(
    eq(landingMediaTable.id, String(req.params.id)),
    ...(allowInactive ? [] : [eq(landingMediaTable.isActive, true)]),
    eq(landingMediaTable.sourceType, "OBJECT"),
  )).limit(1);
  if (!row) {
    res.status(404).json({ error: "الوسيط غير موجود.", code: "LANDING_MEDIA_NOT_FOUND" });
    return;
  }
  try {
    const object = await storage.streamObject(row.fileRef);
    if (!row.mimeType) {
      res.status(500).json({ error: "نوع MIME للوسيط غير مضبوط.", code: "MEDIA_MIME_MISSING" });
      return;
    }
    res.setHeader("Content-Type", row.mimeType);
    if (object.size > 0) res.setHeader("Content-Length", String(object.size));
    res.setHeader(
      "Cache-Control",
      allowInactive ? "private, no-store" : "no-store",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    object.stream.pipe(res);
  } catch (err) {
    if (err instanceof ObjectNotFoundError) {
      res.status(404).json({ error: "الملف غير موجود.", code: "MEDIA_FILE_NOT_FOUND" });
      return;
    }
    req.log.error({ err, mediaId: row.id }, "landing media object serve failed");
    res.status(500).json({ error: "تعذر عرض الملف.", code: "MEDIA_FILE_ERROR" });
  }
}

/* Public proxy for object-backed media. It checks active DB state first. */
router.get("/landing-media/:id/file", async (req, res): Promise<void> => {
  await streamMediaFile(req, res, false);
});

/* Keep this guard local as well as at the router index: the public read
 * endpoint must be mounted before the platform-admin middleware. */
router.use("/platform-admin", requireAuth, requirePlatformAdmin);

/* The remaining endpoints are platform-super-admin only. */
router.get("/platform-admin/landing-media/:id/file", async (req, res): Promise<void> => {
  await streamMediaFile(req, res, true);
});

router.post("/platform-admin/landing-media/upload-url", async (req, res): Promise<void> => {
  const input = parseOrRespond(landingMediaUploadInputSchema, req.body, res);
  if (!input) return;
  try {
    const result = await storage.createLandingMediaUploadUrl();
    req.log.info({ mediaType: input.contentType, sizeBytes: input.size }, "landing media upload URL issued");
    res.status(201).json({ uploadURL: result.uploadUrl, objectPath: result.objectPath, metadata: input });
  } catch (err) {
    req.log.error({ err }, "landing media upload URL failed");
    res.status(503).json({ error: "تعذر تجهيز رفع الملف.", code: "MEDIA_STORAGE_UNAVAILABLE" });
  }
});

router.get("/platform-admin/landing-media", async (_req, res): Promise<void> => {
  const rows = await db.select().from(landingMediaTable)
    .orderBy(asc(landingMediaTable.mediaType), asc(landingMediaTable.sortOrder), asc(landingMediaTable.createdAt));
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.json(landingMediaAdminResponseSchema.parse({ media: rows.map(adminDto) }));
});

router.post("/platform-admin/landing-media", async (req, res): Promise<void> => {
  const input = parseOrRespond(createLandingMediaInputSchema, req.body, res);
  if (!input) return;
  let promotedPath: string | undefined;
  try {
    const promoted = await storage.promoteLandingMediaObject(input.fileRef, input.mimeType, input.sizeBytes);
    promotedPath = promoted.objectPath;
    const row = await db.transaction(async (tx) => {
      if (input.mediaType === "HERO" && input.isActive) await deactivateOtherHeroes(tx);
      const [created] = await tx.insert(landingMediaTable).values({
        titleAr: input.titleAr,
        titleEn: input.titleEn,
        mediaType: input.mediaType,
        sortOrder: input.sortOrder,
        isActive: input.isActive,
        sourceType: "OBJECT",
        fileRef: promoted.objectPath,
        mimeType: promoted.mimeType,
        sizeBytes: promoted.sizeBytes,
        descriptionAr: input.descriptionAr ?? null,
        descriptionEn: input.descriptionEn ?? null,
      }).returning();
      await writeAudit({
        tenantId: null, userId: req.currentUser!.id, action: "platform_landing_media_created",
        entityType: "landing_media", entityId: created!.id, summary: "إضافة وسيط للصفحة الرئيسية",
        details: { mediaType: input.mediaType, sourceType: "OBJECT", fileRef: promoted.objectPath },
      }, tx);
      return created!;
    });
    promotedPath = undefined;
    res.status(201).json({ media: adminDto(row) });
  } catch (err) {
    if (promotedPath) await cleanupPromotedObject(promotedPath);
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "LANDING_MEDIA_NOT_FOUND") {
      res.status(404).json({ error: err.message, code: "LANDING_MEDIA_NOT_FOUND" });
      return;
    }
    if (err instanceof Error && "code" in err && String((err as { code: string }).code).startsWith("MEDIA_")) {
      res.status(422).json({ error: err.message, code: (err as { code: string }).code });
      return;
    }
    if (isActiveHeroConflict(err)) {
      res.status(409).json({ error: "يوجد بالفعل وسيط HERO نشط.", code: "ACTIVE_HERO_CONFLICT" });
      return;
    }
    throw err;
  }
});

router.patch("/platform-admin/landing-media/:id", async (req, res): Promise<void> => {
  const input = parseOrRespond(updateLandingMediaInputSchema, req.body, res);
  if (!input) return;
  const id = String(req.params.id);
  const [existing] = await db.select().from(landingMediaTable).where(eq(landingMediaTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الوسيط غير موجود.", code: "LANDING_MEDIA_NOT_FOUND" });
    return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      const mediaType = input.mediaType ?? existing.mediaType;
      const isActive = input.isActive ?? existing.isActive;
      if (mediaType === "HERO" && isActive) await deactivateOtherHeroes(tx, id);
      const [row] = await tx.update(landingMediaTable).set({
        ...input,
        descriptionAr: input.descriptionAr !== undefined ? input.descriptionAr : existing.descriptionAr,
        descriptionEn: input.descriptionEn !== undefined ? input.descriptionEn : existing.descriptionEn,
        updatedAt: new Date(),
      }).where(eq(landingMediaTable.id, id)).returning();
      if (!row) {
        throw Object.assign(new Error("الوسيط غير موجود."), { code: "LANDING_MEDIA_NOT_FOUND" });
      }
      await writeAudit({
        tenantId: null, userId: req.currentUser!.id, action: "platform_landing_media_updated",
        entityType: "landing_media", entityId: id, summary: "تعديل وسيط الصفحة الرئيسية",
        details: { changedFields: Object.keys(input) },
      }, tx);
      return row!;
    });
    res.json({ media: adminDto(updated) });
  } catch (err) {
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "LANDING_MEDIA_NOT_FOUND") {
      res.status(404).json({ error: err.message, code: "LANDING_MEDIA_NOT_FOUND" });
      return;
    }
    if (err instanceof Error && "code" in err && String((err as { code: string }).code).startsWith("MEDIA_")) {
      res.status(422).json({ error: err.message, code: (err as { code: string }).code });
      return;
    }
    if (isActiveHeroConflict(err)) {
      res.status(409).json({ error: "يوجد بالفعل وسيط HERO نشط.", code: "ACTIVE_HERO_CONFLICT" });
      return;
    }
    throw err;
  }
});

router.put("/platform-admin/landing-media/:id/replace", async (req, res): Promise<void> => {
  const input = parseOrRespond(replaceLandingMediaInputSchema, req.body, res);
  if (!input) return;
  const id = String(req.params.id);
  const [existing] = await db.select().from(landingMediaTable).where(eq(landingMediaTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الوسيط غير موجود.", code: "LANDING_MEDIA_NOT_FOUND" });
    return;
  }
  let promotedPath: string | undefined;
  try {
    const promoted = await storage.promoteLandingMediaObject(input.fileRef, input.mimeType, input.sizeBytes);
    promotedPath = promoted.objectPath;
    const updated = await db.transaction(async (tx) => {
      const [row] = await tx.update(landingMediaTable).set({
        sourceType: "OBJECT",
        fileRef: promoted.objectPath,
        mimeType: promoted.mimeType,
        sizeBytes: promoted.sizeBytes,
        updatedAt: new Date(),
      }).where(eq(landingMediaTable.id, id)).returning();
      if (!row) {
        throw Object.assign(new Error("الوسيط غير موجود."), { code: "LANDING_MEDIA_NOT_FOUND" });
      }
      await writeAudit({
        tenantId: null, userId: req.currentUser!.id, action: "platform_landing_media_replaced",
        entityType: "landing_media", entityId: id, summary: "استبدال ملف وسيط الصفحة الرئيسية",
        details: { sourceType: "OBJECT", fileRef: promoted.objectPath },
      }, tx);
      return row!;
    });
    promotedPath = undefined;
    if (existing.sourceType === "OBJECT") await cleanupObjectIfUnreferenced(existing.fileRef);
    res.json({ media: adminDto(updated) });
  } catch (err) {
    if (promotedPath) await cleanupPromotedObject(promotedPath);
    if (err instanceof Error && "code" in err && (err as { code: string }).code === "LANDING_MEDIA_NOT_FOUND") {
      res.status(404).json({ error: err.message, code: "LANDING_MEDIA_NOT_FOUND" });
      return;
    }
    if (err instanceof Error && "code" in err && String((err as { code: string }).code).startsWith("MEDIA_")) {
      res.status(422).json({ error: err.message, code: (err as { code: string }).code });
      return;
    }
    if (isActiveHeroConflict(err)) {
      res.status(409).json({ error: "يوجد بالفعل وسيط HERO نشط.", code: "ACTIVE_HERO_CONFLICT" });
      return;
    }
    throw err;
  }
});

router.post("/platform-admin/landing-media/:id/status", async (req, res): Promise<void> => {
  const input = parseOrRespond(landingMediaStatusInputSchema, req.body, res);
  if (!input) return;
  const id = String(req.params.id);
  const [existing] = await db.select().from(landingMediaTable).where(eq(landingMediaTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الوسيط غير موجود.", code: "LANDING_MEDIA_NOT_FOUND" });
    return;
  }
  try {
    const updated = await db.transaction(async (tx) => {
      if (input.isActive && existing.mediaType === "HERO") await deactivateOtherHeroes(tx, id);
      const [row] = await tx.update(landingMediaTable).set({ isActive: input.isActive, updatedAt: new Date() }).where(eq(landingMediaTable.id, id)).returning();
      await writeAudit({
        tenantId: null, userId: req.currentUser!.id,
        action: input.isActive ? "platform_landing_media_activated" : "platform_landing_media_deactivated",
        entityType: "landing_media", entityId: id, summary: input.isActive ? "تفعيل وسيط الصفحة الرئيسية" : "إيقاف وسيط الصفحة الرئيسية",
        details: { mediaType: existing.mediaType },
      }, tx);
      return row!;
    });
    res.json({ media: adminDto(updated) });
  } catch (err) {
    if (isActiveHeroConflict(err)) {
      res.status(409).json({ error: "يوجد بالفعل وسيط HERO نشط.", code: "ACTIVE_HERO_CONFLICT" });
      return;
    }
    throw err;
  }
});

router.post("/platform-admin/landing-media/reorder", async (req, res): Promise<void> => {
  const input = parseOrRespond(reorderLandingMediaInputSchema, req.body, res);
  if (!input) return;
  const rows = await db.select({ id: landingMediaTable.id }).from(landingMediaTable).where(eq(landingMediaTable.mediaType, input.mediaType));
  const rowIds = new Set(rows.map((row) => row.id));
  if (input.orderedIds.length !== rowIds.size || new Set(input.orderedIds).size !== input.orderedIds.length || input.orderedIds.some((id) => !rowIds.has(id))) {
    res.status(400).json({ error: "يجب أن تتضمن قائمة الترتيب جميع الوسائط.", code: "INVALID_MEDIA_ORDER" });
    return;
  }
  await db.transaction(async (tx) => {
    for (const [sortOrder, id] of input.orderedIds.entries()) {
      await tx.update(landingMediaTable).set({ sortOrder, updatedAt: new Date() }).where(eq(landingMediaTable.id, id));
    }
    await writeAudit({
      tenantId: null, userId: req.currentUser!.id, action: "platform_landing_media_reordered",
      entityType: "landing_media", summary: "إعادة ترتيب وسائط الصفحة الرئيسية",
      details: { mediaType: input.mediaType, count: input.orderedIds.length },
    }, tx);
  });
  res.json({ ok: true });
});

router.delete("/platform-admin/landing-media/:id", async (req, res): Promise<void> => {
  const id = String(req.params.id);
  const [existing] = await db.select().from(landingMediaTable).where(eq(landingMediaTable.id, id)).limit(1);
  if (!existing) {
    res.status(404).json({ error: "الوسيط غير موجود.", code: "LANDING_MEDIA_NOT_FOUND" });
    return;
  }
  await db.transaction(async (tx) => {
    await tx.delete(landingMediaTable).where(eq(landingMediaTable.id, id));
    await writeAudit({
      tenantId: null, userId: req.currentUser!.id, action: "platform_landing_media_deleted",
      entityType: "landing_media", entityId: id, summary: "حذف وسيط الصفحة الرئيسية",
      details: { mediaType: existing.mediaType, sourceType: existing.sourceType, fileRef: existing.fileRef },
    }, tx);
  });
  if (existing.sourceType === "OBJECT") await cleanupObjectIfUnreferenced(existing.fileRef);
  res.status(204).send();
});

export default router;