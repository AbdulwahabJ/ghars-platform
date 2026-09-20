import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  agentFor,
  freshAdminSession,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let agent: TestAgent;

beforeAll(async () => {
  agent = await freshAdminSession(app, pool);
});

afterAll(async () => {
  await pool.end();
});

describe("patients CRUD, duplicates, and search", () => {
  let patientId: string;

  it("requires authentication", async () => {
    const res = await agentFor(app).get("/api/patients");
    expect(res.status).toBe(401);
  });

  it("creates a patient, canonicalizing Arabic-digit file numbers and 05 mobiles", async () => {
    const res = await agent.post("/api/patients").send({
      fileNumber: "١٢٣٤", // Arabic-Indic digits
      fullName: "محمد الأحمد",
      mobileNumber: "0501234567",
      age: 40,
    });
    expect(res.status).toBe(201);
    expect(res.body.patient.fileNumber).toBe("1234");
    expect(res.body.patient.mobileNumber).toBe("0501234567");
    expect(res.body.patient.mobileNormalized).toBe("966501234567");
    expect(res.body.patient.status).toBe("active");
    patientId = res.body.patient.id;
  });

  it("rejects an invalid mobile number without guessing a country code", async () => {
    const res = await agent.post("/api/patients").send({
      fileNumber: "5000",
      fullName: "مريض برقم خاطئ",
      mobileNumber: "12345678",
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_MOBILE");
  });

  it("rejects a duplicate active file number (Arabic or Latin digits)", async () => {
    const res = await agent.post("/api/patients").send({
      fileNumber: "1234",
      fullName: "مريض مكرر",
    });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_ACTIVE");
    expect(res.body.patientId).toBe(patientId);

    const arabic = await agent.post("/api/patients").send({
      fileNumber: "١٢٣٤",
      fullName: "مريض مكرر",
    });
    expect(arabic.status).toBe(409);
    expect(arabic.body.code).toBe("DUPLICATE_ACTIVE");
  });

  it("reports file number status via check-file-number", async () => {
    const active = await agent.get(
      "/api/patients/check-file-number?fileNumber=1234",
    );
    expect(active.body.status).toBe("active");
    expect(active.body.patientId).toBe(patientId);

    const available = await agent.get(
      "/api/patients/check-file-number?fileNumber=9999",
    );
    expect(available.body).toEqual({ status: "available" });
  });

  it("updates patient fields and audits the change", async () => {
    const res = await agent.patch(`/api/patients/${patientId}`).send({
      fullName: "محمد الأحمد المحدث",
      age: 41,
    });
    expect(res.status).toBe(200);
    expect(res.body.patient.fullName).toBe("محمد الأحمد المحدث");
    expect(res.body.patient.age).toBe(41);

    const audit = await pool.query(
      "SELECT count(*)::int AS n FROM audit_logs WHERE action = 'patient_update'",
    );
    expect(audit.rows[0].n).toBe(1);
  });

  it("rejects updating the file number onto an existing patient", async () => {
    const other = await agent.post("/api/patients").send({
      fileNumber: "2000",
      fullName: "مريض آخر",
    });
    expect(other.status).toBe(201);

    const res = await agent
      .patch(`/api/patients/${other.body.patient.id}`)
      .send({ fileNumber: "1234" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_ACTIVE");
  });

  it("archives, reports DUPLICATE_ARCHIVED, and restores", async () => {
    const archived = await agent.post(`/api/patients/${patientId}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.patient.status).toBe("archived");
    expect(archived.body.patient.archivedAt).not.toBeNull();

    const dup = await agent.post("/api/patients").send({
      fileNumber: "1234",
      fullName: "مريض جديد بنفس الرقم",
    });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe("DUPLICATE_ARCHIVED");

    const restored = await agent.post(`/api/patients/${patientId}/restore`);
    expect(restored.status).toBe(200);
    expect(restored.body.patient.status).toBe("active");
    expect(restored.body.patient.archivedAt).toBeNull();
  });

  it("previews and atomically applies an audited bulk archive and restore", async () => {
    const second = await agent.post("/api/patients").send({
      fileNumber: "3000",
      fullName: "مريض عملية جماعية",
    });
    expect(second.status).toBe(201);
    const patientIds = [patientId, second.body.patient.id];

    const preview = await agent.post("/api/patients/bulk-action").send({
      patientIds,
      action: "archive",
      preview: true,
    });
    expect(preview.status).toBe(200);
    expect(preview.body).toMatchObject({
      action: "archive",
      preview: true,
      affected: 0,
      patientIds,
      impact: { patients: 2 },
    });

    const archived = await agent.post("/api/patients/bulk-action").send({
      patientIds,
      action: "archive",
    });
    expect(archived.status).toBe(200);
    expect(archived.body.affected).toBe(2);

    const invalidState = await agent.post("/api/patients/bulk-action").send({
      patientIds,
      action: "archive",
    });
    expect(invalidState.status).toBe(409);
    expect(invalidState.body.code).toBe("BULK_STATE_CONFLICT");

    const restored = await agent.post("/api/patients/bulk-action").send({
      patientIds,
      action: "restore",
    });
    expect(restored.status).toBe(200);
    expect(restored.body.affected).toBe(2);

    const audit = await pool.query(
      "SELECT action, count(*)::int AS n FROM audit_logs WHERE action IN ('PATIENT_ARCHIVED', 'PATIENT_RESTORED', 'BULK_ARCHIVE', 'BULK_RESTORE') GROUP BY action",
    );
    expect(Object.fromEntries(audit.rows.map((row) => [row.action, row.n]))).toMatchObject({
      PATIENT_ARCHIVED: 2,
      PATIENT_RESTORED: 2,
      BULK_ARCHIVE: 1,
      BULK_RESTORE: 1,
    });
  });

  it("searches by normalized Arabic name", async () => {
    // أحمد vs الاحمد: hamza/normalization must not matter.
    const res = await agent.get("/api/patients?query=الاحمد");
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: { id: string }) => p.id === patientId)).toBe(
      true,
    );
  });

  it("searches by mobile digits, including Arabic-Indic input", async () => {
    const res = await agent.get(
      `/api/patients?query=${encodeURIComponent("٠٥٠١٢٣")}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.items.some((p: { id: string }) => p.id === patientId)).toBe(
      true,
    );
  });

  it("filters by archived status", async () => {
    const res = await agent.get("/api/patients?status=archived");
    expect(res.status).toBe(200);
    expect(res.body.items.every((p: { status: string }) => p.status === "archived")).toBe(true);
  });

  it("returns 404 for unknown or malformed ids", async () => {
    const bad = await agent.get("/api/patients/not-a-uuid");
    expect(bad.status).toBe(404);
    const missing = await agent.get(
      "/api/patients/00000000-0000-4000-8000-000000000000",
    );
    expect(missing.status).toBe(404);
  });
});
