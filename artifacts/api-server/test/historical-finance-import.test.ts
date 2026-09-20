import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import {
  agentFor,
  freshAdminSession,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let admin: TestAgent;
let verifiedCaseId: string;
const files = {
  clinical: "HF-TEST-CLINICAL-98201",
  verified: "HF-TEST-VERIFIED-98202",
  mapping: "HF-TEST-MAPPING-98203",
};
const csv = (file: string, cost = "Total 8,000; Paid 5,000") =>
  `NAME + MOBILE,FILE,DATE,SITE,Q,Former,Graft,Pros,NOTE,COST\nHistorical ${file},${file},2025-07-15,36,Q1,F1,G1,3M,DIRECT,"${cost}"\n`;

async function analyze(content: string) {
  const response = await admin.post("/api/admin/import/universal/analyze").send({
    filename: "historical-finance-test.csv",
    mime: "text/csv",
    content,
    mode: "clinical_only",
  });
  expect(response.status).toBe(201);
  return response.body;
}

async function approve(batch: any, mode: "clinical_only" | "clinical_and_verified_finance" = "clinical_only") {
  const rowNumber = batch.rows[0].rowNumber;
  const patched = await admin.patch(`/api/admin/import/universal/${batch.id}/mapping`).send({
    version: batch.version,
    mappings: [],
    rowApprovals: [{ rowNumber, approved: true }],
  });
  expect(patched.status).toBe(200);
  const committed = await admin.post(`/api/admin/import/universal/${batch.id}/commit`).send({
    version: patched.body.version,
    rowNumbers: [rowNumber],
    mode,
  });
  expect(committed.status).toBe(200);
  return committed.body.batch;
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  await pool.query(
    `INSERT INTO platform_settings (id, legacy_import_enabled, updated_at)
     VALUES ('global', true, now())
     ON CONFLICT (id) DO UPDATE SET legacy_import_enabled = true, updated_at = now()`,
  );
});

afterAll(async () => {
  // Deliberately narrow cleanup: only this test's unique file numbers.
  const allFiles = [...Object.values(files), "HF-TEST-CONTRADICT-98204", "HF-TEST-UNVERIFIED-98205", "HF-TEST-APPLYALL-98206"];
  await pool.query(`DELETE FROM payments WHERE implant_case_id IN (SELECT c.id FROM implant_cases c JOIN patients p ON p.id = c.patient_id WHERE p.file_number = ANY($1::text[]))`, [allFiles]);
  await pool.query(`DELETE FROM implants WHERE implant_case_id IN (SELECT c.id FROM implant_cases c JOIN patients p ON p.id = c.patient_id WHERE p.file_number = ANY($1::text[]))`, [allFiles]);
  await pool.query(`DELETE FROM implant_cases WHERE patient_id IN (SELECT id FROM patients WHERE file_number = ANY($1::text[]))`, [allFiles]);
  await pool.query(`DELETE FROM patients WHERE file_number = ANY($1::text[])`, [allFiles]);
  await pool.end();
});

describe("historical finance universal import isolation", () => {
  it("clinical-only preserves raw COST without snapshot or payments", async () => {
    const batch = await analyze(csv(files.clinical));
    const committed = await approve(batch);
    const patient = await pool.query("SELECT id FROM patients WHERE file_number = $1", [files.clinical]);
    const row = await pool.query(
      `SELECT c.id, c.legacy_cost_note,
        (SELECT count(*) FROM case_historical_finance h WHERE h.case_id = c.id) AS snapshots,
        (SELECT count(*) FROM payments p WHERE p.implant_case_id = c.id) AS payments
       FROM implant_cases c WHERE c.patient_id = $1`,
      [patient.rows[0].id],
    );
    expect(committed.status).toBe("COMMITTED");
    expect(row.rows[0].legacy_cost_note).toContain("Total 8,000");
    expect(Number(row.rows[0].snapshots)).toBe(0);
    expect(Number(row.rows[0].payments)).toBe(0);
  });

  it("verified correction stores decimal SAR snapshot and no payment", async () => {
    const batch = await analyze(csv(files.verified));
    const corrected = await admin.patch(`/api/admin/import/universal/${batch.id}/mapping`).send({
      version: batch.version,
      mappings: [],
      financeCorrections: [{
        rowNumber: batch.rows[0].rowNumber,
        historicalTotalAmount: 800000,
        historicalPaidAmount: 500000,
        openingRemainingBalance: 300000,
        historicalPaymentStatus: "PARTIALLY_PAID",
        isVerified: true,
      }],
    });
    expect(corrected.status).toBe(200);
    await approve(corrected.body, "clinical_and_verified_finance");
    const patient = await pool.query("SELECT id FROM patients WHERE file_number = $1", [files.verified]);
    const row = await pool.query(
      `SELECT h.case_id, h.tenant_id, h.historical_total_amount, h.historical_paid_amount,
        h.opening_remaining_balance, h.is_verified,
        (SELECT count(*) FROM payments p WHERE p.implant_case_id = h.case_id) AS payments
       FROM case_historical_finance h JOIN implant_cases c ON c.id = h.case_id
       WHERE c.patient_id = $1`,
      [patient.rows[0].id],
    );
    expect(row.rows).toHaveLength(1);
    expect(row.rows[0].historical_total_amount).toBe("8000.00");
    expect(row.rows[0].historical_paid_amount).toBe("5000.00");
    expect(row.rows[0].opening_remaining_balance).toBe("3000.00");
    expect(row.rows[0].is_verified).toBe(true);
    expect(Number(row.rows[0].payments)).toBe(0);
    verifiedCaseId = row.rows[0].case_id;
  });

  it("rejects contradictory verified correction", async () => {
    const batch = await analyze(csv("HF-TEST-CONTRADICT-98204"));
    const response = await admin.patch(`/api/admin/import/universal/${batch.id}/mapping`).send({
      version: batch.version,
      mappings: [],
      financeCorrections: [{
        rowNumber: batch.rows[0].rowNumber, historicalTotalAmount: 800000, historicalPaidAmount: 500000,
        openingRemainingBalance: 200000, historicalPaymentStatus: "PARTIALLY_PAID", isVerified: true,
      }],
    });
    expect(response.status).toBe(422);
  });

  it("never promotes consistent parser output without explicit verification", async () => {
    const batch = await analyze(csv("HF-TEST-UNVERIFIED-98205"));
    const patched = await admin.patch(`/api/admin/import/universal/${batch.id}/mapping`).send({
      version: batch.version, mappings: [], rowApprovals: [{ rowNumber: batch.rows[0].rowNumber, approved: true }],
    });
    expect(patched.status).toBe(200);
    const response = await admin.post(`/api/admin/import/universal/${batch.id}/commit`).send({
      version: patched.body.version, rowNumbers: [batch.rows[0].rowNumber], mode: "clinical_and_verified_finance",
    });
    expect(response.status).toBe(422);
  });

  it("requires and then applies explicit single-value implant resolution", async () => {
    const content = `NAME + MOBILE,FILE,DATE,SITE,SIZE,Q,Former,Graft,Pros,NOTE,COST\nTwo implant,HF-TEST-APPLYALL-98206,2025-07-15,"36,37","4x10,4x10",Q1,F1,G1,3M,DIRECT,"لم تدفع شيء"\n`;
    const batch = await analyze(content);
    expect(batch.rows[0].status).toBe("REVIEW_REQUIRED");
    expect(batch.rows[0].proposed.implants).toEqual([
      expect.objectContaining({ site: "36", qValue: null, formerValue: null, graftValue: null }),
      expect.objectContaining({ site: "37", qValue: null, formerValue: null, graftValue: null }),
    ]);
    const patched = await admin.patch(`/api/admin/import/universal/${batch.id}/mapping`).send({
      version: batch.version, mappings: [],
      implantApplyToAll: [{ rowNumber: batch.rows[0].rowNumber, fields: ["qValue", "formerValue", "graftValue"] }],
    });
    if (patched.status !== 200) console.log("apply all response", patched.body, batch.rows[0].proposed);
    expect(patched.status).toBe(200);
    expect(patched.body.rows[0].proposed.implants.map((implant: any) => [implant.qValue, implant.formerValue, implant.graftValue])).toEqual([
      ["Q1", "F1", "G1"], ["Q1", "F1", "G1"],
    ]);
    const committed = await approve(patched.body);
    const patient = await pool.query("SELECT id FROM patients WHERE file_number = $1", ["HF-TEST-APPLYALL-98206"]);
    const implants = await pool.query("SELECT q_value, former_value, graft_value FROM implants i JOIN implant_cases c ON c.id = i.implant_case_id WHERE c.patient_id = $1 ORDER BY site", [patient.rows[0].id]);
    expect(implants.rows).toEqual([
      { q_value: "Q1", former_value: "F1", graft_value: "G1" },
      { q_value: "Q1", former_value: "F1", graft_value: "G1" },
    ]);
    expect(committed.status).toBe("COMMITTED");
  });

  it("maps clinical metrics and notes without creating procedures/events", async () => {
    const batch = await analyze(csv(files.mapping, "لم تدفع شيء"));
    await approve(batch);
    const patient = await pool.query("SELECT id FROM patients WHERE file_number = $1", [files.mapping]);
    const row = await pool.query(
      `SELECT c.id, c.pros_value, c.general_note, i.q_value, i.former_value, i.graft_value,
        (SELECT count(*) FROM bone_graft_procedures b WHERE b.implant_case_id = c.id) AS grafts,
        (SELECT count(*) FROM prosthetic_events p WHERE p.implant_case_id = c.id) AS prosthetics
       FROM implant_cases c JOIN implants i ON i.implant_case_id = c.id WHERE c.patient_id = $1`,
      [patient.rows[0].id],
    );
    expect(row.rows[0]).toMatchObject({ pros_value: "3M", general_note: "DIRECT", q_value: "Q1", former_value: "F1", graft_value: "G1" });
    expect(Number(row.rows[0].grafts)).toBe(0);
    expect(Number(row.rows[0].prosthetics)).toBe(0);
  });

  it("subtracts only a real Ghars payment from opening balance and isolates case access", async () => {
    const before = await admin.get(`/api/implant-cases/${verifiedCaseId}/finance`);
    expect(before.status).toBe(200);
    expect(before.body.summary.outstanding).toBe(3000);
    expect(before.body.summary.historicalTotalAmount).toBe(8000);
    const payment = await admin.post(`/api/implant-cases/${verifiedCaseId}/payments`).send({
      amount: 1000, paymentDate: "2026-09-25", paymentMethod: "نقدي", paymentLabel: "دفعة إضافية",
    });
    expect(payment.status).toBe(201);
    const after = await admin.get(`/api/implant-cases/${verifiedCaseId}/finance`);
    expect(after.body.summary.outstanding).toBe(2000);
    expect(after.body.summary.openingRemainingBalance).toBe(3000);
    expect(after.body.summary.historicalPaidAmount).toBe(5000);
    const inaccessible = await admin.get("/api/implant-cases/00000000-0000-0000-0000-000000000099/finance");
    expect(inaccessible.status).toBe(404);
  });
});