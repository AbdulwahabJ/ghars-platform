import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { Router, type IRouter } from "express";
import sharp from "sharp";
import {
  db, patientAttachmentsTable, patientsTable, implantCasesTable, usersTable,
  type PatientAttachment,
} from "@workspace/db";
import {
  patientAttachmentFinalizeSchema, patientAttachmentMetadataSchema,
  patientAttachmentUpdateSchema, patientAttachmentUploadRequestSchema,
} from "@workspace/shared";
import { parseOrRespond } from "../lib/validation";
import { ObjectNotFoundError, ObjectStorageService } from "../lib/objectStorage";
import { requireRole } from "../middlewares/auth";
import { writeAudit } from "../lib/audit";
import { logger } from "../lib/logger";
import { createPatientAttachmentToken, verifyPatientAttachmentCancelToken, verifyPatientAttachmentToken } from "../lib/patient-attachment-token";

const router: IRouter = Router();
const storage = new ObjectStorageService();
const clinicalRoles = ["ADMIN", "DOCTOR", "ASSISTANT"] as const;
const genericNotFound = { error: "المرفق غير موجود.", code: "PATIENT_ATTACHMENT_NOT_FOUND" };
let lastStagingCleanupAt = 0;

async function patientFor(req: Parameters<Parameters<IRouter["get"]>[1]>[0]) {
  const [patient] = await db.select().from(patientsTable).where(and(
    eq(patientsTable.id, String(req.params.patientId)),
    eq(patientsTable.tenantId, req.currentTenant!.id),
  )).limit(1);
  return patient;
}
function dto(row: PatientAttachment, uploadedByName: string | null = null) {
  return { ...row, uploadedByName, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString() };
}
async function validateCase(tenantId: string, patientId: string, caseId: string | null | undefined): Promise<boolean> {
  if (!caseId) return true;
  const [found] = await db.select({ id: implantCasesTable.id }).from(implantCasesTable).where(and(
    eq(implantCasesTable.id, caseId), eq(implantCasesTable.tenantId, tenantId), eq(implantCasesTable.patientId, patientId),
  )).limit(1);
  return !!found;
}
function validUuid(value: unknown): value is string { return typeof value === "string" && z.string().uuid().safeParse(value).success; }
function genericParam404(req: { params: { patientId?: unknown; attachmentId?: unknown } }): boolean {
  return !validUuid(req.params.patientId) || (req.params.attachmentId !== undefined && !validUuid(req.params.attachmentId));
}
function safeDownloadFilename(name: string): string {
  const cleaned = name.replace(/[\u0000-\u001f\u007f"\\]/g, "_").replace(/[\r\n]/g, "_").trim().slice(0, 180);
  return cleaned || "attachment";
}

router.get("/patients/:patientId/attachments", requireRole(...clinicalRoles), async (req, res) => {
  if (!validUuid(req.params.patientId)) { res.status(404).json(genericNotFound); return; }
  if (!await patientFor(req)) { res.status(404).json(genericNotFound); return; }
  const rows = await db.select({ attachment: patientAttachmentsTable, uploadedByName: usersTable.fullName }).from(patientAttachmentsTable)
    .leftJoin(usersTable, eq(usersTable.id, patientAttachmentsTable.uploadedBy)).where(and(
    eq(patientAttachmentsTable.tenantId, req.currentTenant!.id), eq(patientAttachmentsTable.patientId, String(req.params.patientId)),
  )).orderBy(desc(patientAttachmentsTable.createdAt));
  res.setHeader("Cache-Control", "private, no-store");
  res.json({ attachments: rows.map((r) => dto(r.attachment, r.uploadedByName)) });
});

router.post("/patients/:patientId/attachments/upload-url", requireRole(...clinicalRoles), async (req, res) => {
  if (!validUuid(req.params.patientId)) { res.status(404).json(genericNotFound); return; }
  const patient = await patientFor(req);
  if (!patient) { res.status(404).json(genericNotFound); return; }
  if (patient.archivedAt) { res.status(409).json({ error: "لا يمكن تعديل مريض مؤرشف.", code: "PATIENT_ARCHIVED" }); return; }
  const input = parseOrRespond(patientAttachmentUploadRequestSchema, req.body, res);
  if (!input || !await validateCase(req.currentTenant!.id, patient.id, input.implantCaseId)) {
    if (input) res.status(404).json(genericNotFound);
    return;
  }
  try {
    if (Date.now() - lastStagingCleanupAt > 60 * 60 * 1000) {
      lastStagingCleanupAt = Date.now();
      void storage.cleanupPatientAttachmentStaging().catch((error) => logger.warn({ error }, "patient attachment staging cleanup unavailable"));
    }
    const result = await storage.createPatientAttachmentUploadUrl();
    const uploadToken = createPatientAttachmentToken({ tenantId: req.currentTenant!.id, patientId: patient.id, userId: req.currentUser!.id, objectPath: result.objectPath, name: input.name, size: input.size, contentType: input.contentType });
    res.status(201).json({ uploadURL: result.uploadUrl, objectPath: result.objectPath, uploadToken, metadata: input });
  } catch { res.status(503).json({ error: "تعذر تجهيز رفع الملف.", code: "PATIENT_ATTACHMENT_STORAGE_UNAVAILABLE" }); }
});

router.post("/patients/:patientId/attachments", requireRole(...clinicalRoles), async (req, res) => {
  if (!validUuid(req.params.patientId)) { res.status(404).json(genericNotFound); return; }
  const patient = await patientFor(req);
  if (!patient) { res.status(404).json(genericNotFound); return; }
  if (patient.archivedAt) { res.status(409).json({ error: "لا يمكن تعديل مريض مؤرشف.", code: "PATIENT_ARCHIVED" }); return; }
  const input = parseOrRespond(patientAttachmentFinalizeSchema, req.body, res);
  if (!input || !verifyPatientAttachmentToken(input.uploadToken, { tenantId: req.currentTenant!.id, patientId: patient.id, userId: req.currentUser!.id, objectPath: input.objectPath, name: input.name, size: input.size, contentType: input.contentType }) || !await validateCase(req.currentTenant!.id, patient.id, input.implantCaseId)) {
    if (input) res.status(404).json(genericNotFound);
    return;
  }
  let promoted: string | undefined;
  try {
    const result = await storage.promotePatientAttachmentObject(input.objectPath, input.contentType, input.size, input.name);
    promoted = result.objectPath;
    const [row] = await db.insert(patientAttachmentsTable).values({
      tenantId: req.currentTenant!.id, patientId: patient.id, implantCaseId: input.implantCaseId ?? null,
      title: input.title ?? null, category: input.category ?? null, note: input.note ?? null, fileDate: input.fileDate ?? null,
      originalFilename: input.name, mimeType: result.mimeType, fileSize: result.sizeBytes, storageKey: result.objectPath,
      uploadedBy: req.currentUser!.id,
    }).returning();
    if (!row) throw new Error("Attachment insert failed");
    await writeAudit({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "PATIENT_ATTACHMENT_UPLOADED", entityType: "patient_attachment", entityId: row.id, details: { patientId: patient.id } });
    promoted = undefined;
    const [withName] = await db.select({ attachment: patientAttachmentsTable, uploadedByName: usersTable.fullName }).from(patientAttachmentsTable).leftJoin(usersTable, eq(usersTable.id, patientAttachmentsTable.uploadedBy)).where(eq(patientAttachmentsTable.id, row.id));
    res.status(201).json({ attachment: dto(withName!.attachment, withName!.uploadedByName) });
  } catch (error) {
    await storage.deleteObject(input.objectPath).catch((cleanupError) => logger.error({ cleanupError, objectPath: input.objectPath }, "patient attachment staging cleanup failed"));
    if (promoted) await storage.deleteObject(promoted).catch((cleanupError) => logger.error({ cleanupError, promoted }, "patient attachment canonical cleanup failed"));
    const code = error instanceof Error && "code" in error ? String((error as { code: string }).code) : "";
    if (code.startsWith("PATIENT_ATTACHMENT_") || error instanceof ObjectNotFoundError) { res.status(422).json({ error: "الملف غير صالح أو غير موجود.", code: code || "PATIENT_ATTACHMENT_INVALID" }); return; }
    throw error;
  }
});

async function attachmentFor(req: Parameters<Parameters<IRouter["get"]>[1]>[0]) {
  if (genericParam404(req)) return undefined;
  const [row] = await db.select().from(patientAttachmentsTable).where(and(
    eq(patientAttachmentsTable.id, String(req.params.attachmentId)),
    eq(patientAttachmentsTable.patientId, String(req.params.patientId)),
    eq(patientAttachmentsTable.tenantId, req.currentTenant!.id),
  )).limit(1);
  return row;
}
router.get("/patients/:patientId/attachments/:attachmentId/thumbnail", requireRole(...clinicalRoles), async (req, res) => {
  const row = await attachmentFor(req);
  if (!row || !row.mimeType.startsWith("image/")) { res.status(404).json(genericNotFound); return; }
  try {
    const object = await storage.streamPatientAttachment(row.storageKey);
    const chunks: Buffer[] = [];
    let received = 0;
    for await (const chunk of object.stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      received += buffer.length;
      if (received > 20 * 1024 * 1024) throw new Error("Thumbnail source exceeds attachment limit");
      chunks.push(buffer);
    }
    const thumbnail = await sharp(Buffer.concat(chunks))
      .rotate()
      .resize({ width: 320, height: 240, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 72 })
      .toBuffer();
    res.setHeader("Content-Type", "image/webp");
    res.setHeader("Content-Length", String(thumbnail.length));
    res.setHeader("Cache-Control", "private, max-age=300");
    res.setHeader("X-Content-Type-Options", "nosniff");
    await writeAudit({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "PATIENT_ATTACHMENT_VIEWED", entityType: "patient_attachment", entityId: row.id, details: { patientId: row.patientId, thumbnail: true } });
    res.send(thumbnail);
  } catch {
    if (!res.headersSent) res.status(404).json(genericNotFound);
  }
});
router.get("/patients/:patientId/attachments/:attachmentId/file", requireRole(...clinicalRoles), async (req, res) => {
  const row = await attachmentFor(req);
  if (!row) { res.status(404).json(genericNotFound); return; }
  try {
    const object = await storage.streamPatientAttachment(row.storageKey);
    const downloading = req.query.download === "1";
    const safeName = safeDownloadFilename(row.originalFilename);
    res.setHeader("Content-Type", row.mimeType); res.setHeader("Content-Disposition", `${downloading ? "attachment" : "inline"}; filename="${safeName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`);
    res.setHeader("Cache-Control", "private, no-store"); res.setHeader("X-Content-Type-Options", "nosniff"); res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'self'");
    if (object.size > 0) res.setHeader("Content-Length", String(object.size));
    await writeAudit({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: downloading ? "PATIENT_ATTACHMENT_DOWNLOADED" : "PATIENT_ATTACHMENT_VIEWED", entityType: "patient_attachment", entityId: row.id, details: { patientId: row.patientId } });
    object.stream.pipe(res);
  } catch { res.status(404).json(genericNotFound); }
});
router.post("/patients/:patientId/attachments/cancel", requireRole(...clinicalRoles), async (req, res) => {
  if (!validUuid(req.params.patientId)) { res.status(404).json(genericNotFound); return; }
  const input = req.body as { objectPath?: unknown; uploadToken?: unknown };
  if (!verifyPatientAttachmentCancelToken(input.uploadToken, { tenantId: req.currentTenant!.id, patientId: String(req.params.patientId), userId: req.currentUser!.id, objectPath: String(input.objectPath) })) {
    res.status(404).json(genericNotFound); return;
  }
  await storage.deleteObject(String(input.objectPath)).catch((error) => logger.error({ error, objectPath: input.objectPath }, "patient attachment staging cleanup failed"));
  res.status(204).end();
});
router.patch("/patients/:patientId/attachments/:attachmentId", requireRole(...clinicalRoles), async (req, res) => {
  const row = await attachmentFor(req);
  if (!row) { res.status(404).json(genericNotFound); return; }
  const patient = await patientFor(req);
  if (patient?.archivedAt) { res.status(409).json({ error: "لا يمكن تعديل مريض مؤرشف.", code: "PATIENT_ARCHIVED" }); return; }
  const input = parseOrRespond(patientAttachmentUpdateSchema, req.body, res); if (!input) return;
  const [updated] = await db.update(patientAttachmentsTable).set({ ...input, updatedAt: new Date() }).where(and(eq(patientAttachmentsTable.id, row.id), eq(patientAttachmentsTable.tenantId, req.currentTenant!.id))).returning();
  await writeAudit({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "PATIENT_ATTACHMENT_METADATA_UPDATED", entityType: "patient_attachment", entityId: row.id, details: { patientId: row.patientId } });
  const [withName] = await db.select({ attachment: patientAttachmentsTable, uploadedByName: usersTable.fullName }).from(patientAttachmentsTable).leftJoin(usersTable, eq(usersTable.id, patientAttachmentsTable.uploadedBy)).where(eq(patientAttachmentsTable.id, updated!.id));
  res.json({ attachment: dto(withName!.attachment, withName!.uploadedByName) });
});
router.delete("/patients/:patientId/attachments/:attachmentId", requireRole("ADMIN"), async (req, res) => {
  const row = await attachmentFor(req);
  if (!row) { res.status(404).json(genericNotFound); return; }
  const patient = await patientFor(req);
  if (patient?.archivedAt) { res.status(409).json({ error: "لا يمكن تعديل مريض مؤرشف.", code: "PATIENT_ARCHIVED" }); return; }
  await db.delete(patientAttachmentsTable).where(and(eq(patientAttachmentsTable.id, row.id), eq(patientAttachmentsTable.tenantId, req.currentTenant!.id)));
  await storage.deleteObject(row.storageKey).catch((error) => logger.error({ error, attachmentId: row.id, storageKey: row.storageKey }, "patient attachment object cleanup failed"));
  await writeAudit({ tenantId: req.currentTenant!.id, userId: req.currentUser!.id, action: "PATIENT_ATTACHMENT_DELETED", entityType: "patient_attachment", entityId: row.id, details: { patientId: row.patientId } });
  res.status(204).end();
});

export default router;