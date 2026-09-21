import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Readable } from "node:stream";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import app from "../src/app";
import { ObjectStorageService } from "../src/lib/objectStorage";
import {
  agentFor, attachUserToInternalTenant, freshAdminSession, login, makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
const stagingPath = "/objects/patient-attachments-staging/00000000-0000-4000-8000-000000000099";
const finalPath = "/objects/patient-attachments/00000000-0000-4000-8000-000000000098";
let admin: TestAgent;
let doctor: TestAgent;
let assistant: TestAgent;
let patientId: string;
let archivedPatientId: string;
let deleteObject: ReturnType<typeof vi.spyOn>;

async function createPatient(agent: TestAgent, fileNumber: string) {
  const response = await agent.post("/api/patients").send({ fileNumber, fullName: `مريض ${fileNumber}` });
  expect(response.status).toBe(201);
  return response.body.patient.id as string;
}

async function attachmentRow(
  patient: string,
  storageKey = `/objects/patient-attachments/${randomUUID()}`,
  originalFilename = "scan.pdf",
  mimeType = "application/pdf",
) {
  const result = await pool.query(
    `INSERT INTO patient_attachments
      (tenant_id, patient_id, original_filename, mime_type, file_size, storage_key, uploaded_by)
     SELECT tm.tenant_id, $1, $3, $4, 35, $2, tm.user_id
       FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
      WHERE u.username='admin' AND tm.is_active=true
      RETURNING id`,
    [patient, storageKey, originalFilename, mimeType],
  );
  return result.rows[0].id as string;
}

async function imageAttachmentRow(patient: string, storageKey = `/objects/patient-attachments/${randomUUID()}`) {
  const result = await pool.query(
    `INSERT INTO patient_attachments
      (tenant_id, patient_id, original_filename, mime_type, file_size, storage_key, uploaded_by)
     SELECT tm.tenant_id, $1, 'scan.png', 'image/png', 68, $2, tm.user_id
       FROM tenant_memberships tm JOIN users u ON u.id=tm.user_id
      WHERE u.username='admin' AND tm.is_active=true
      RETURNING id`,
    [patient, storageKey],
  );
  return result.rows[0].id as string;
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  const password = bcrypt.hashSync("Attach0Pass12", 10);
  await pool.query(
    `INSERT INTO users (username,password_hash,full_name,role) VALUES
      ('attach-doctor',$1,'طبيب المرفقات','DOCTOR'),
      ('attach-assistant',$1,'مساعد المرفقات','ASSISTANT')`,
    [password],
  );
  await attachUserToInternalTenant(pool, "attach-doctor", "DOCTOR");
  await attachUserToInternalTenant(pool, "attach-assistant", "ASSISTANT");
  doctor = agentFor(app); assistant = agentFor(app);
  await login(doctor, "attach-doctor", "Attach0Pass12");
  await login(assistant, "attach-assistant", "Attach0Pass12");
  patientId = await createPatient(admin, "ATT-1");
  archivedPatientId = await createPatient(admin, "ATT-ARCHIVE");
  await pool.query("UPDATE patients SET archived_at=now() WHERE id=$1", [archivedPatientId]);
  deleteObject = vi.spyOn(ObjectStorageService.prototype, "deleteObject").mockResolvedValue();
  vi.spyOn(ObjectStorageService.prototype, "createPatientAttachmentUploadUrl").mockResolvedValue({
    uploadUrl: "https://storage.invalid/upload", objectPath: stagingPath,
  });
  vi.spyOn(ObjectStorageService.prototype, "promotePatientAttachmentObject").mockResolvedValue({
    objectPath: finalPath, mimeType: "application/pdf", sizeBytes: 35,
  });
});

beforeEach(() => {
  deleteObject.mockClear();
});

afterAll(async () => { vi.restoreAllMocks(); await pool.end(); });

describe("patient attachment authorization and isolation", () => {
  it("requires authentication and rejects malformed UUIDs", async () => {
    expect((await agentFor(app).get(`/api/patients/${patientId}/attachments`)).status).toBe(401);
    expect((await admin.get("/api/patients/not-a-uuid/attachments")).status).toBe(404);
    expect((await admin.get("/api/patients/not-a-uuid/attachments/not-a-uuid/file")).status).toBe(404);
  });

  it.each([
    ["admin", () => admin], ["doctor", () => doctor], ["assistant", () => assistant],
  ])("%s can list and request an upload", async (_name, getAgent) => {
    const agent = getAgent();
    expect((await agent.get(`/api/patients/${patientId}/attachments`)).status).toBe(200);
    const response = await agent.post(`/api/patients/${patientId}/attachments/upload-url`).send({
      name: "scan.pdf", size: 35, contentType: "application/pdf", title: "قبل العلاج",
    });
    expect(response.status).toBe(201);
    expect(response.body.uploadToken).toEqual(expect.any(String));
  });

  it("finalizes with metadata, uploader and audit, then permits metadata update", async () => {
    const upload = await doctor.post(`/api/patients/${patientId}/attachments/upload-url`).send({
      name: "scan.pdf", size: 35, contentType: "application/pdf", title: "عنوان",
      category: "MEDICAL_REPORT", note: "ملاحظة", fileDate: "2026-01-02",
    });
    const finalized = await doctor.post(`/api/patients/${patientId}/attachments`).send({
      ...upload.body.metadata, objectPath: upload.body.objectPath, uploadToken: upload.body.uploadToken,
    });
    expect(finalized.status).toBe(201);
    const id = finalized.body.attachment.id;
    expect(finalized.body.attachment.uploadedByName).toBe("طبيب المرفقات");
    expect(finalized.body.attachment.title).toBe("عنوان");
    const audit = await pool.query(
      "SELECT action FROM audit_logs WHERE entity_type='patient_attachment' AND entity_id=$1 ORDER BY created_at",
      [id],
    );
    expect(audit.rows.map((row) => row.action)).toContain("PATIENT_ATTACHMENT_UPLOADED");
    const updated = await assistant.patch(`/api/patients/${patientId}/attachments/${id}`).send({ title: "معدل" });
    expect(updated.status).toBe(200);
    expect(updated.body.attachment.title).toBe("معدل");
    const metadataAudit = await pool.query(
      "SELECT 1 FROM audit_logs WHERE action='PATIENT_ATTACHMENT_METADATA_UPDATED' AND entity_id=$1", [id],
    );
    expect(metadataAudit.rowCount).toBe(1);
  });

  it("rejects tampered tokens and requires a patient-local optional case", async () => {
    const upload = await admin.post(`/api/patients/${patientId}/attachments/upload-url`).send({
      name: "scan.pdf", size: 35, contentType: "application/pdf",
    });
    const bad = await admin.post(`/api/patients/${patientId}/attachments`).send({
      ...upload.body.metadata, objectPath: upload.body.objectPath,
      uploadToken: `${upload.body.uploadToken}x`,
    });
    expect(bad.status).toBe(404);
    const otherPatient = await createPatient(admin, "ATT-OTHER");
    const foreignCase = await admin.post(`/api/patients/${otherPatient}/implant-cases`).send({ procedureDate: "2026-01-01" });
    const wrongCase = await admin.post(`/api/patients/${patientId}/attachments/upload-url`).send({
      name: "scan.pdf", size: 35, contentType: "application/pdf", implantCaseId: foreignCase.body.case.id,
    });
    expect(wrongCase.status).toBe(404);
  });

  it("blocks all mutations on archived patients", async () => {
    const body = { name: "scan.pdf", size: 35, contentType: "application/pdf" };
    expect((await admin.post(`/api/patients/${archivedPatientId}/attachments/upload-url`).send(body)).status).toBe(409);
    expect((await admin.post(`/api/patients/${archivedPatientId}/attachments`).send(body)).status).toBe(409);
    const id = await attachmentRow(archivedPatientId);
    expect((await admin.patch(`/api/patients/${archivedPatientId}/attachments/${id}`).send({ title: "x" })).status).toBe(409);
    expect((await admin.delete(`/api/patients/${archivedPatientId}/attachments/${id}`)).status).toBe(409);
  });

  it("returns generic 404 for wrong-patient and foreign attachment identifiers", async () => {
    const other = await createPatient(admin, "ATT-WRONG");
    const id = await attachmentRow(other);
    const foreign = await pool.query(
      `WITH t AS (
         INSERT INTO tenants (reference_code,name,status,activated_at)
         VALUES ('attachment-foreign','Foreign','ACTIVE',now()) RETURNING id
       ), p AS (
         INSERT INTO patients (tenant_id,file_number,full_name,full_name_normalized)
         SELECT id,'FOREIGN-ATT','Foreign patient','foreign patient' FROM t RETURNING id
       )
       INSERT INTO patient_attachments
         (tenant_id,patient_id,original_filename,mime_type,file_size,storage_key,uploaded_by)
       SELECT t.id,p.id,'foreign.pdf','application/pdf',35,$1,u.id
         FROM t,p JOIN users u ON u.username='admin'
       RETURNING patient_id,id`,
      [`/objects/patient-attachments/${randomUUID()}`],
    );
    const foreignId = foreign.rows[0].id as string;
    const expected = { code: "PATIENT_ATTACHMENT_NOT_FOUND" };
    expect((await admin.get(`/api/patients/${patientId}/attachments/${id}/file`)).body).toMatchObject(expected);
    expect((await admin.patch(`/api/patients/${patientId}/attachments/${id}`).send({ title: "x" })).body).toMatchObject(expected);
    expect((await admin.delete(`/api/patients/${patientId}/attachments/${id}`)).body).toMatchObject(expected);
    expect((await admin.get(`/api/patients/${patientId}/attachments/${foreignId}/file`)).body).toMatchObject(expected);
  });
});

describe("patient attachment file lifecycle", () => {
  it("serves an authenticated lightweight thumbnail without returning the original image", async () => {
    const id = await imageAttachmentRow(patientId);
    const png = Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
      "base64",
    );
    vi.spyOn(ObjectStorageService.prototype, "streamPatientAttachment").mockResolvedValueOnce({
      stream: Readable.from(png), contentType: "image/png", size: png.length,
    });
    const response = await doctor.get(`/api/patients/${patientId}/attachments/${id}/thumbnail`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("image/webp");
    expect(response.headers["cache-control"]).toContain("private");
    expect(response.body.length).toBeLessThan(1024);
  });

  it.each([
    ["scan.jpg", "image/jpeg"],
    ["scan.jpeg", "image/jpeg"],
    ["scan.png", "image/png"],
    ["scan.webp", "image/webp"],
  ])("streams full image previews for %s", async (filename, mimeType) => {
    const id = await attachmentRow(patientId, `/objects/patient-attachments/${randomUUID()}`, filename, mimeType);
    const imageBytes = Buffer.from("image-preview");
    vi.spyOn(ObjectStorageService.prototype, "streamPatientAttachment").mockResolvedValueOnce({
      stream: Readable.from(imageBytes), contentType: mimeType, size: imageBytes.length,
    });
    const response = await doctor.get(`/api/patients/${patientId}/attachments/${id}/file`);
    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain(mimeType);
    expect(response.body).toEqual(imageBytes);
  });

  it("streams view/download with safe headers and audit, and only ADMIN can delete", async () => {
    const lifecycleKey = `/objects/patient-attachments/${randomUUID()}`;
    const id = await attachmentRow(patientId, lifecycleKey, "صورة الزراعة.pdf");
    vi.spyOn(ObjectStorageService.prototype, "streamPatientAttachment").mockResolvedValue({
      stream: Readable.from(Buffer.from("pdf-data")), contentType: "application/pdf", size: 0,
    });
    const view = await doctor.get(`/api/patients/${patientId}/attachments/${id}/file`);
    expect(view.status).toBe(200);
    expect(view.headers["content-disposition"]).toContain("inline");
    expect(view.headers["content-disposition"]).toContain('filename="attachment.pdf"');
    expect(view.headers["content-disposition"]).toContain("filename*=UTF-8''");
    expect(view.headers["x-content-type-options"]).toBe("nosniff");
    const download = await doctor.get(`/api/patients/${patientId}/attachments/${id}/file?download=1`);
    expect(download.headers["content-disposition"]).toContain("attachment");
    expect((await assistant.delete(`/api/patients/${patientId}/attachments/${id}`)).status).toBe(403);
    expect((await admin.delete(`/api/patients/${patientId}/attachments/${id}`)).status).toBe(204);
    expect(deleteObject).toHaveBeenCalledWith(lifecycleKey);
    const audit = await pool.query("SELECT action FROM audit_logs WHERE entity_id=$1", [id]);
    expect(audit.rows.map((row) => row.action)).toContain("PATIENT_ATTACHMENT_DELETED");
    expect(audit.rows.map((row) => row.action)).toContain("PATIENT_ATTACHMENT_VIEWED");
    expect(audit.rows.map((row) => row.action)).toContain("PATIENT_ATTACHMENT_DOWNLOADED");
  });

  it("cleans staging and promoted objects when finalization fails", async () => {
    vi.spyOn(ObjectStorageService.prototype, "promotePatientAttachmentObject").mockRejectedValueOnce(
      Object.assign(new Error("invalid"), { code: "PATIENT_ATTACHMENT_INVALID" }),
    );
    const upload = await assistant.post(`/api/patients/${patientId}/attachments/upload-url`).send({
      name: "scan.pdf", size: 35, contentType: "application/pdf",
    });
    const response = await assistant.post(`/api/patients/${patientId}/attachments`).send({
      ...upload.body.metadata, objectPath: upload.body.objectPath, uploadToken: upload.body.uploadToken,
    });
    expect(response.status).toBe(422);
    expect(deleteObject).toHaveBeenCalledWith(stagingPath);
  });
});