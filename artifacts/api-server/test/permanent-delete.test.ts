import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import app from "../src/app";
import {
  agentFor,
  attachUserToInternalTenant,
  freshAdminSession,
  login,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let admin: TestAgent;
let assistant: TestAgent;
let tenantId: string;
let adminId: string;

async function createPatient(fileNumber: string) {
  const response = await admin.post("/api/patients").send({
    fileNumber,
    fullName: `مريض ${fileNumber}`,
  });
  expect(response.status).toBe(201);
  return response.body.patient.id as string;
}

async function createCase(patientId: string) {
  const response = await admin
    .post(`/api/patients/${patientId}/implant-cases`)
    .send({ procedureDate: "2026-09-20" });
  expect(response.status).toBe(201);
  return response.body.case.id as string;
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  const context = await pool.query(
    `SELECT t.id AS tenant_id, u.id AS user_id
       FROM tenants t
       JOIN tenant_memberships tm ON tm.tenant_id = t.id
       JOIN users u ON u.id = tm.user_id
      WHERE t.reference_code = 'internal' AND u.username = 'admin'`,
  );
  tenantId = context.rows[0].tenant_id;
  adminId = context.rows[0].user_id;

  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ASSISTANT')`,
    ["delete-assistant", bcrypt.hashSync("Delete0Pass12", 10), "مساعد الحذف"],
  );
  await attachUserToInternalTenant(pool, "delete-assistant", "ASSISTANT");
  assistant = agentFor(app);
  await login(assistant, "delete-assistant", "Delete0Pass12");
});

afterAll(async () => {
  await pool.end();
});

describe("admin permanent deletion", () => {
  it("previews and transactionally deletes a rich case graph while preserving the patient and sibling case", async () => {
    const patientId = await createPatient("HD-1001");
    const caseId = await createCase(patientId);
    const siblingCaseId = await createCase(patientId);
    const implant = await admin
      .post(`/api/implant-cases/${caseId}/implants`)
      .send({ site: "36", system: "Neodent", diameter: 3.5, length: 10 });
    expect(implant.status).toBe(201);
    const implantId = implant.body.implant.id as string;

    await pool.query(
      `INSERT INTO prosthetic_events
         (tenant_id, implant_case_id, implant_id, event_type, event_date, created_by)
       VALUES ($1, $2, $3, 'تركيب نهائي', '2026-09-20', $4)`,
      [tenantId, caseId, implantId, adminId],
    );
    await pool.query(
      `INSERT INTO bone_graft_procedures
         (tenant_id, implant_case_id, implant_id, procedure_date, procedure_type, created_by)
       VALUES ($1, $2, $3, '2026-09-20', 'زراعة عظم', $4)`,
      [tenantId, caseId, implantId, adminId],
    );
    await pool.query(
      `INSERT INTO followups
         (tenant_id, implant_case_id, patient_id, followup_type, created_by)
       VALUES ($1, $2, $3, 'متابعة بعد العملية', $4)`,
      [tenantId, caseId, patientId, adminId],
    );
    await pool.query(
      `INSERT INTO case_charges
         (tenant_id, implant_case_id, implant_id, charge_type, amount, charge_date, created_by)
       VALUES ($1, $2, $3, 'زراعة عظم', 100, '2026-09-20', $4)`,
      [tenantId, caseId, implantId, adminId],
    );
    await pool.query(
      `INSERT INTO case_discounts
         (tenant_id, implant_case_id, amount, discount_date, created_by)
       VALUES ($1, $2, 10, '2026-09-20', $3)`,
      [tenantId, caseId, adminId],
    );
    await pool.query(
      `INSERT INTO installment_plans
         (tenant_id, implant_case_id, total_amount, installment_count, first_due_date, created_by)
       VALUES ($1, $2, 200, 1, '2026-10-20', $3)`,
      [tenantId, caseId, adminId],
    );
    const plan = await pool.query(
      `SELECT id FROM installment_plans WHERE implant_case_id = $1`,
      [caseId],
    );
    const installment = await pool.query(
      `INSERT INTO installments (tenant_id, plan_id, sequence, due_date, amount)
       VALUES ($1, $2, 1, '2026-10-20', 200) RETURNING id`,
      [tenantId, plan.rows[0].id],
    );
    await pool.query(
      `INSERT INTO payments
         (tenant_id, implant_case_id, installment_id, amount, payment_date, created_by)
       VALUES ($1, $2, $3, 50, '2026-09-20', $4)`,
      [tenantId, caseId, installment.rows[0].id, adminId],
    );
    await pool.query(
      `INSERT INTO case_historical_finance
         (tenant_id, case_id, raw_source_text, historical_total_amount,
          historical_paid_amount, opening_remaining_balance, is_verified, verified_by)
       VALUES ($1, $2, 'legacy', 300, 100, 200, true, $3)`,
      [tenantId, caseId, adminId],
    );
    const imported = await pool.query(
      `INSERT INTO import_batches
         (tenant_id, imported_by, source_filename, source_mime, source_rows,
          mappings, normalized_rows, created_records, committed_row_numbers, summary)
       VALUES ($1, $2, 'legacy.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          '[]', '[]', '[]', $3::jsonb, '[1]', '{}')
       RETURNING id`,
      [tenantId, adminId, JSON.stringify([{ caseId }])],
    );

    const preview = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({ caseIds: [caseId], preview: true });
    expect(preview.status).toBe(200);
    expect(preview.body.impact).toMatchObject({
      cases: 1,
      implants: 1,
      boneGraftProcedures: 1,
      prostheticEvents: 1,
      followups: 1,
      payments: 1,
      charges: 1,
      discounts: 1,
      installmentPlans: 1,
      installments: 1,
      historicalFinance: 1,
      importedCases: 1,
    });
    expect(preview.body.importBatchContext).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: imported.rows[0].id })]),
    );

    const unconfirmed = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({ caseIds: [caseId], preview: false });
    expect(unconfirmed.status).toBe(400);

    const deleted = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({
        caseIds: [caseId],
        preview: false,
        confirmed: true,
        previewToken: preview.body.previewToken,
      });
    expect(deleted.status).toBe(200);
    const remaining = await pool.query(
      `SELECT
         EXISTS(SELECT 1 FROM patients WHERE id=$1) patient_exists,
         EXISTS(SELECT 1 FROM implant_cases WHERE id=$2) deleted_case_exists,
         EXISTS(SELECT 1 FROM implant_cases WHERE id=$3) sibling_exists,
         EXISTS(SELECT 1 FROM import_batches WHERE id=$4) batch_exists`,
      [patientId, caseId, siblingCaseId, imported.rows[0].id],
    );
    expect(remaining.rows[0]).toEqual({
      patient_exists: true,
      deleted_case_exists: false,
      sibling_exists: true,
      batch_exists: true,
    });
    const audit = await pool.query(
      `SELECT details FROM audit_logs
       WHERE action='PERMANENT_CASE_DELETE' AND details->'caseIds' ? $1`,
      [caseId],
    );
    expect(audit.rowCount).toBe(1);
  });

  it("rejects employees and rejects a mixed cross-tenant request without partial deletion", async () => {
    const patientId = await createPatient("HD-1002");
    const localCaseId = await createCase(patientId);
    const foreign = await pool.query(
      `WITH tenant AS (
         INSERT INTO tenants (reference_code, name, status, activated_at)
         VALUES ('delete-foreign', 'Foreign', 'ACTIVE', now()) RETURNING id
       ), patient AS (
         INSERT INTO patients (tenant_id, file_number, full_name, full_name_normalized)
         SELECT id, 'F-1', 'Foreign Patient', 'foreign patient' FROM tenant RETURNING id, tenant_id
       )
       INSERT INTO implant_cases (tenant_id, patient_id)
       SELECT tenant_id, id FROM patient RETURNING id`,
    );
    const foreignCaseId = foreign.rows[0].id as string;

    const forbidden = await assistant
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({ caseIds: [localCaseId], preview: true });
    expect(forbidden.status).toBe(403);

    const rejected = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({ caseIds: [localCaseId, foreignCaseId], preview: false, confirmed: true });
    expect(rejected.status).toBe(422);
    const localStillExists = await pool.query(
      `SELECT EXISTS(SELECT 1 FROM implant_cases WHERE id=$1) AS exists`,
      [localCaseId],
    );
    expect(localStillExists.rows[0].exists).toBe(true);
  });

  it("bulk deletes three cases in one request and leaves archive available independently", async () => {
    const patientId = await createPatient("HD-1003");
    const caseIds = await Promise.all([
      createCase(patientId),
      createCase(patientId),
      createCase(patientId),
    ]);
    const archived = await admin.post(`/api/implant-cases/${caseIds[0]}/archive`);
    expect(archived.status).toBe(200);
    const recursiveChild = await createCase(patientId);
    const linked = await admin.patch(`/api/implant-cases/${recursiveChild}`).send({
      isReimplantation: true,
      reimplantationReason: "إعادة زراعة",
      sourceCaseId: caseIds[0],
    });
    expect(linked.status).toBe(200);

    const preview = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({ caseIds, preview: true });
    expect(preview.status).toBe(200);
    expect(preview.body.impact.cases).toBe(4);

    const stale = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({
        caseIds,
        preview: false,
        confirmed: true,
        previewToken: "stale-preview-token",
      });
    expect(stale.status).toBe(409);

    const deleted = await admin
      .post("/api/implant-cases/bulk-permanent-delete")
      .send({
        caseIds,
        preview: false,
        confirmed: true,
        previewToken: preview.body.previewToken,
      });
    expect(deleted.status).toBe(200);
    expect(deleted.body.deleted.cases).toBe(4);
    const count = await pool.query(
      `SELECT count(*)::int AS count FROM implant_cases WHERE id = ANY($1::uuid[])`,
      [[...caseIds, recursiveChild]],
    );
    expect(count.rows[0].count).toBe(0);
  });

  it("permanently deletes a full patient graph only after preview and confirmation", async () => {
    const patientId = await createPatient("HD-1004");
    const caseId = await createCase(patientId);
    await admin.post(`/api/implant-cases/${caseId}/implants`).send({ site: "11" });

    const preview = await admin
      .post(`/api/patients/${patientId}/permanent-delete`)
      .send({ preview: true });
    expect(preview.status).toBe(200);
    expect(preview.body.impact).toMatchObject({ patients: 1, cases: 1, implants: 1 });

    const deleted = await admin
      .post(`/api/patients/${patientId}/permanent-delete`)
      .send({
        preview: false,
        confirmed: true,
        previewToken: preview.body.previewToken,
      });
    expect(deleted.status).toBe(200);
    const remaining = await pool.query(
      `SELECT
         EXISTS(SELECT 1 FROM patients WHERE id=$1) patient_exists,
         EXISTS(SELECT 1 FROM implant_cases WHERE id=$2) case_exists`,
      [patientId, caseId],
    );
    expect(remaining.rows[0]).toEqual({ patient_exists: false, case_exists: false });
    const audit = await pool.query(
      `SELECT 1 FROM audit_logs
       WHERE action='PERMANENT_PATIENT_DELETE' AND entity_id=$1`,
      [patientId],
    );
    expect(audit.rowCount).toBe(1);
  });
});