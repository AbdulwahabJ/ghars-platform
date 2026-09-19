import bcrypt from "bcryptjs";
import { mkdir, writeFile } from "node:fs/promises";
import type { IncomingMessage } from "node:http";
import ExcelJS from "exceljs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  ADMIN_PASSWORD,
  agentFor,
  attachUserToInternalTenant,
  freshAdminSession,
  login,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let admin: TestAgent;
let foreignTenantAdmin: TestAgent;
let financeBlindDoctor: TestAgent;
let patientId: string;
let foreignPatientId: string;

function binaryParser(
  response: IncomingMessage,
  callback: (error: Error | null, body: Buffer) => void,
): void {
  const chunks: Buffer[] = [];
  response.on("data", (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  response.on("end", () => callback(null, Buffer.concat(chunks)));
  response.on("error", (error) => callback(error, Buffer.alloc(0)));
}

function getBinary(agent: TestAgent, path: string) {
  return agent.get(path).buffer(true).parse(binaryParser);
}

function jsonBody(response: { body: Buffer }): unknown {
  return JSON.parse(response.body.toString("utf8"));
}

async function seedForeignTenant(): Promise<void> {
  const tenant = await pool.query<{ id: string }>(
    `INSERT INTO tenants
       (reference_code, name, locale, status, activated_at)
     VALUES ('export-foreign', 'Foreign Export Clinic', 'en', 'ACTIVE', now())
     RETURNING id`,
  );
  await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, role)
     VALUES ('export-foreign-admin', 'export-foreign@example.test', $1, 'Foreign Admin', 'ADMIN')`,
    [bcrypt.hashSync(ADMIN_PASSWORD, 10)],
  );
  await pool.query(
    `INSERT INTO tenant_memberships (tenant_id, user_id, role)
     SELECT $1, id, 'ADMIN' FROM users WHERE username = 'export-foreign-admin'`,
    [tenant.rows[0].id],
  );
  foreignTenantAdmin = agentFor(app);
  await login(foreignTenantAdmin, "export-foreign-admin");
  const patient = await foreignTenantAdmin.post("/api/patients").send({
    fileNumber: "FOREIGN-EXPORT-1",
    fullName: "مريض عيادة أخرى Foreign Patient",
  });
  expect(patient.status).toBe(201);
  foreignPatientId = patient.body.patient.id;
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);

  const patient = await admin.post("/api/patients").send({
    fileNumber: "EXPORT-100",
    fullName: "مريض التصدير Export Patient",
    mobileNumber: "0501234567",
  });
  expect(patient.status).toBe(201);
  patientId = patient.body.patient.id;

  const implantCase = await admin
    .post(`/api/patients/${patientId}/implant-cases`)
    .send({
      procedureDate: "2026-08-01",
      caseStatus: "تمت الزراعة",
      treatingDoctor: "د. همام",
      generalNote: "ملاحظة قابلة للتحديد Selectable note",
    });
  expect(implantCase.status).toBe(201);
  const caseId = implantCase.body.case.id as string;

  const baseAmount = await admin
    .patch(`/api/implant-cases/${caseId}/base-amount`)
    .send({ baseTreatmentAmount: 5000 });
  expect(baseAmount.status).toBe(200);
  const payment = await admin
    .post(`/api/implant-cases/${caseId}/payments`)
    .send({
      amount: 1250,
      paymentDate: "2026-08-05",
      paymentLabel: "دفعة أولى",
      paymentMethod: "شبكة",
      referenceNumber: "EXPORT-REF-1",
    });
  expect(payment.status).toBe(201);

  await pool.query(
    `INSERT INTO users (username, email, password_hash, full_name, role)
     VALUES ('export-finance-blind', 'export-finance-blind@example.test', $1, 'Doctor Without Finance', 'DOCTOR')`,
    [bcrypt.hashSync("Export0Pass12", 10)],
  );
  await attachUserToInternalTenant(pool, "export-finance-blind", "DOCTOR");
  financeBlindDoctor = agentFor(app);
  await login(financeBlindDoctor, "export-finance-blind", "Export0Pass12");

  await seedForeignTenant();
});

afterAll(async () => {
  await pool.end();
});

describe("patient record exports", () => {
  it("returns actual PDF bytes for an authorized patient record", async () => {
    const response = await getBinary(
      admin,
      `/api/patients/${patientId}/export.pdf?locale=ar`,
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="patient-record-EXPORT-100\.pdf"$/,
    );
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    expect(response.body.length).toBeGreaterThan(1_000);
    if (process.env.EXPORT_QA_DIR) {
      await mkdir(process.env.EXPORT_QA_DIR, { recursive: true });
      await writeFile(`${process.env.EXPORT_QA_DIR}/patient-record-ar.pdf`, response.body);
    }
  });

  it("returns actual XLSX bytes for an authorized patient record", async () => {
    const response = await getBinary(
      admin,
      `/api/patients/${patientId}/export.xlsx?locale=en`,
    );

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    expect(response.headers["content-disposition"]).toMatch(
      /^attachment; filename="patient-record-EXPORT-100\.xlsx"$/,
    );
    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.body.subarray(0, 2).toString("ascii")).toBe("PK");

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    expect(workbook.worksheets.length).toBeGreaterThan(0);
    expect(workbook.worksheets[0].views[0].rightToLeft).toBe(false);
  });

  it("returns 404 for a patient belonging to a foreign tenant", async () => {
    const response = await getBinary(
      admin,
      `/api/patients/${foreignPatientId}/export.pdf`,
    );

    expect(response.status).toBe(404);
    expect(jsonBody(response)).toEqual({
      error: "المريض غير موجود.",
      code: "PATIENT_NOT_FOUND",
    });
  });

  it("redacts financial sections for a user without finance permission", async () => {
    const response = await getBinary(
      financeBlindDoctor,
      `/api/patients/${patientId}/export.xlsx?locale=en`,
    );

    expect(response.status).toBe(200);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(response.body);
    const sheetNames = workbook.worksheets.map((sheet) => sheet.name).join("\n");
    expect(sheetNames).not.toContain("Financial summary");
    const allValues = workbook.worksheets
      .flatMap((sheet) => sheet.getRows(1, sheet.rowCount))
      .flatMap((row) => row.values ?? [])
      .map((value) => String(value))
      .join("\n");
    expect(allValues).not.toContain("5000");
    expect(allValues).not.toContain("EXPORT-REF-1");
  });

  it("exports archived records only when includeArchived is true", async () => {
    const archived = await admin.post(`/api/patients/${patientId}/archive`);
    expect(archived.status).toBe(200);

    const hidden = await getBinary(
      admin,
      `/api/patients/${patientId}/export.pdf?locale=en`,
    );
    expect(hidden.status).toBe(404);
    expect(jsonBody(hidden)).toEqual({
      error: "المريض غير موجود.",
      code: "PATIENT_NOT_FOUND",
    });

    const included = await getBinary(
      admin,
      `/api/patients/${patientId}/export.pdf?locale=en&includeArchived=true`,
    );
    expect(included.status).toBe(200);
    expect(included.body.subarray(0, 5).toString("ascii")).toBe("%PDF-");
    if (process.env.EXPORT_QA_DIR) {
      await mkdir(process.env.EXPORT_QA_DIR, { recursive: true });
      await writeFile(`${process.env.EXPORT_QA_DIR}/patient-record-en.pdf`, included.body);
    }
  });
});