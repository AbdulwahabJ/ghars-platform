import { afterAll, beforeAll, describe, expect, it } from "vitest";
import bcrypt from "bcryptjs";
import app from "../src/app";
import {
  agentFor,
  freshAdminSession,
  login,
  makePool,
  type TestAgent,
} from "./helpers";

const pool = makePool();
let admin: TestAgent;
/** Assistant without any financial permission (role default). */
let assistant: TestAgent;

/** Riyadh calendar date (YYYY-MM-DD) shifted by whole days from now. */
function riyadhDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
}

const FROM = riyadhDay(-30);
const TO = riyadhDay(0);
const RANGE = `from=${FROM}&to=${TO}`;

let patientAId: string; // active patient with rich data
let caseA1Id: string; // active case, دكتور همام
let caseA2Id: string; // active case, different doctor + system
let archivedPatientId: string;
let archivedCaseOfActivePatientId: string;

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)`,
    [
      "rep-assist",
      bcrypt.hashSync("Rep0TestPass12", 10),
      "مساعد التقارير",
      "ASSISTANT",
    ],
  );
  assistant = agentFor(app);
  await login(assistant, "rep-assist", "Rep0TestPass12");

  /* Patient A: two active cases */
  const pA = await admin.post("/api/patients").send({
    fileNumber: "7001",
    fullName: "مريض التقارير الأول",
  });
  patientAId = pA.body.patient.id;

  const c1 = await admin
    .post(`/api/patients/${patientAId}/implant-cases`)
    .send({ procedureDate: riyadhDay(-5), caseStatus: "جاهز للتركيب" });
  caseA1Id = c1.body.case.id;
  await admin
    .post(`/api/implant-cases/${caseA1Id}/implants`)
    .send({ site: "36", system: "Straumann" });
  await admin
    .post(`/api/implant-cases/${caseA1Id}/implants`)
    .send({ site: "37", system: "Straumann", implantStatus: "فاشلة" });

  const c2 = await admin
    .post(`/api/patients/${patientAId}/implant-cases`)
    .send({ procedureDate: riyadhDay(-2), treatingDoctor: "د. آخر" });
  caseA2Id = c2.body.case.id;
  await admin
    .post(`/api/implant-cases/${caseA2Id}/implants`)
    .send({ site: "46", system: "Osstem" });

  // Case A1 finances: base amount + one payment dated today.
  await admin
    .patch(`/api/implant-cases/${caseA1Id}/base-amount`)
    .send({ baseTreatmentAmount: 1000 });
  await admin.post(`/api/implant-cases/${caseA1Id}/payments`).send({
    amount: 400,
    paymentDate: TO,
    paymentLabel: "دفعة أولى",
    paymentMethod: "نقدي",
  });

  // Follow-ups on case A1: one today, one overdue, one contact task due.
  await admin.post(`/api/implant-cases/${caseA1Id}/followups`).send({
    followupType: "متابعة بعد العملية",
    scheduledAt: `${riyadhDay(0)}T09:00`,
  });
  await admin.post(`/api/implant-cases/${caseA1Id}/followups`).send({
    followupType: "أشعة",
    scheduledAt: `${riyadhDay(-1)}T10:00`,
  });
  await admin.post(`/api/implant-cases/${caseA1Id}/followups`).send({
    followupType: "تقييم ثبات الزرعة",
    scheduledAt: `${riyadhDay(3)}T10:00`,
    requiresContact: true,
    contactDueAt: riyadhDay(0),
  });

  /* Archived case belonging to the active patient — seeded with follow-ups
     and a payment BEFORE archiving, so the dashboard KPIs/lists and
     collectedThisMonth regress if archived cases ever leak back in. */
  const cArch = await admin
    .post(`/api/patients/${patientAId}/implant-cases`)
    .send({ procedureDate: riyadhDay(-3), caseStatus: "جاهز للتركيب" });
  archivedCaseOfActivePatientId = cArch.body.case.id;
  await admin
    .post(`/api/implant-cases/${archivedCaseOfActivePatientId}/implants`)
    .send({ site: "11", system: "Straumann" });
  await admin
    .post(`/api/implant-cases/${archivedCaseOfActivePatientId}/prosthetic-events`)
    .send({ eventType: "تركيب دائم", eventDate: TO });
  await admin.post(`/api/implant-cases/${archivedCaseOfActivePatientId}/followups`).send({
    followupType: "متابعة بعد العملية",
    scheduledAt: `${riyadhDay(0)}T11:00`,
  });
  await admin.post(`/api/implant-cases/${archivedCaseOfActivePatientId}/followups`).send({
    followupType: "أشعة",
    scheduledAt: `${riyadhDay(-2)}T10:00`,
  });
  await admin.post(`/api/implant-cases/${archivedCaseOfActivePatientId}/followups`).send({
    followupType: "تقييم ثبات الزرعة",
    scheduledAt: `${riyadhDay(4)}T10:00`,
    requiresContact: true,
    contactDueAt: riyadhDay(0),
  });
  await admin
    .patch(`/api/implant-cases/${archivedCaseOfActivePatientId}/base-amount`)
    .send({ baseTreatmentAmount: 900 });
  await admin
    .post(`/api/implant-cases/${archivedCaseOfActivePatientId}/payments`)
    .send({
      amount: 250,
      paymentDate: TO,
      paymentLabel: "دفعة أولى",
      paymentMethod: "نقدي",
    });
  await admin
    .post(`/api/implant-cases/${archivedCaseOfActivePatientId}/archive`)
    .send({});

  /* Archived patient with an active case (must be excluded everywhere). */
  const pB = await admin.post("/api/patients").send({
    fileNumber: "7002",
    fullName: "مريض مؤرشف للتقارير",
  });
  archivedPatientId = pB.body.patient.id;
  const cB = await admin
    .post(`/api/patients/${archivedPatientId}/implant-cases`)
    .send({ procedureDate: riyadhDay(-4) });
  await admin
    .post(`/api/implant-cases/${cB.body.case.id}/implants`)
    .send({ site: "21", system: "Straumann" });
  await admin
    .post(`/api/implant-cases/${cB.body.case.id}/prosthetic-events`)
    .send({ eventType: "تركيب مؤقت", eventDate: TO });
  await admin.post(`/api/patients/${archivedPatientId}/archive`).send({});
});

afterAll(async () => {
  await pool.end();
});

describe("GET /api/dashboard", () => {
  it("requires authentication", async () => {
    const res = await agentFor(app).get("/api/dashboard");
    expect(res.status).toBe(401);
  });

  it("returns live KPI counts excluding archived records", async () => {
    const res = await admin.get("/api/dashboard");
    expect(res.status).toBe(200);
    const k = res.body.kpis;
    expect(k.activePatients).toBe(1);
    expect(k.activeCases).toBe(2); // archived case + archived patient's case excluded
    expect(k.activeImplants).toBe(3);
    expect(k.todayAppointments).toBe(1);
    expect(k.overdueFollowups).toBe(1);
    expect(k.readyCases).toBe(1);
    expect(k.failedOrRedoImplants).toBe(1);
    expect(k.contactTasksDue).toBe(1);
  });

  it("includes financial KPIs for admin, excluding archived-case payments", async () => {
    const res = await admin.get("/api/dashboard");
    expect(res.body.financials).not.toBeNull();
    // 400 from the active case only; the 250 payment on the archived case
    // and its 900 base amount must not count.
    expect(res.body.financials.collectedThisMonth).toBe(400);
    expect(res.body.financials.totalOutstanding).toBe(600);
  });

  it("omits financial KPIs for an assistant without permission", async () => {
    const res = await assistant.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.financials).toBeNull();
    expect(res.body.kpis.activePatients).toBe(1);
  });

  it("returns actionable lists linking to the patient", async () => {
    const res = await admin.get("/api/dashboard");
    expect(res.body.todayAppointments).toHaveLength(1);
    expect(res.body.todayAppointments[0].patientId).toBe(patientAId);
    expect(res.body.overdueFollowups).toHaveLength(1);
    expect(res.body.readyCases).toHaveLength(1);
    expect(res.body.contactTasks).toHaveLength(1);
    expect(res.body.recentActivities.length).toBeGreaterThan(0);
  });
});

describe("GET /api/statistics", () => {
  it("requires authentication and validates the range", async () => {
    expect((await agentFor(app).get(`/api/statistics?${RANGE}`)).status).toBe(401);
    expect((await admin.get("/api/statistics")).status).toBe(400);
    expect(
      (await admin.get(`/api/statistics?from=${TO}&to=${FROM}`)).status,
    ).toBe(400);
  });

  it("counts cases/implants in range, excluding archived", async () => {
    const res = await admin.get(`/api/statistics?${RANGE}`);
    expect(res.status).toBe(200);
    const totalCases = res.body.overTime.reduce(
      (a: number, b: { cases: number }) => a + b.cases,
      0,
    );
    const totalImplants = res.body.overTime.reduce(
      (a: number, b: { implants: number }) => a + b.implants,
      0,
    );
    expect(totalCases).toBe(2);
    expect(totalImplants).toBe(3);
    expect(res.body.failedImplants).toBe(1);
    expect(res.body.needsRedoImplants).toBe(0);
    const straumann = res.body.implantSystems.find(
      (s: { name: string }) => s.name === "Straumann",
    );
    expect(straumann.count).toBe(2);
  });

  it("applies doctor and implant-system filters", async () => {
    const byDoctor = await admin.get(
      `/api/statistics?${RANGE}&treatingDoctor=${encodeURIComponent("د. آخر")}`,
    );
    const cases = byDoctor.body.overTime.reduce(
      (a: number, b: { cases: number }) => a + b.cases,
      0,
    );
    expect(cases).toBe(1);

    const bySystem = await admin.get(
      `/api/statistics?${RANGE}&implantSystem=Osstem`,
    );
    const sysCases = bySystem.body.overTime.reduce(
      (a: number, b: { cases: number }) => a + b.cases,
      0,
    );
    expect(sysCases).toBe(1);
  });

  it("excludes cases outside the date range", async () => {
    const res = await admin.get(
      `/api/statistics?from=${riyadhDay(-30)}&to=${riyadhDay(-10)}`,
    );
    const cases = res.body.overTime.reduce(
      (a: number, b: { cases: number }) => a + b.cases,
      0,
    );
    expect(cases).toBe(0);
  });

  it("returns the centralized hub and never exposes financial aggregates without permission", async () => {
    const adminRes = await admin.get(`/api/statistics?${RANGE}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.hub).toBeDefined();
    expect(adminRes.body.hub.overview.cases).toBe(2);
    expect(adminRes.body.hub.overview.implants).toBe(3);
    expect(adminRes.body.hub.financials).toMatchObject({
      collected: 400,
      payments: 1,
    });

    const assistantRes = await assistant.get(`/api/statistics?${RANGE}`);
    expect(assistantRes.status).toBe(200);
    expect(assistantRes.body.hub.financials).toBeNull();
    expect(JSON.stringify(assistantRes.body.hub)).not.toContain(
      "treatmentValue",
    );
    expect(assistantRes.body.hub.overview.cases).toBe(2);
  });

  it("accepts an implant-status filter for the hub", async () => {
    const res = await admin.get(
      `/api/statistics?${RANGE}&implantStatus=${encodeURIComponent("فاشلة")}`,
    );
    expect(res.status).toBe(200);
    expect(res.body.hub.overview.failedImplants).toBe(1);
    expect(res.body.hub.overview.cases).toBe(1);
  });
});

describe("GET /api/reports/operational", () => {
  it("returns one row per active case with follow-up flags", async () => {
    const res = await admin.get(`/api/reports/operational?${RANGE}`);
    expect(res.status).toBe(200);
    expect(res.body.financialsIncluded).toBe(true);
    expect(res.body.rows).toHaveLength(2);
    const row1 = res.body.rows.find(
      (r: { caseId: string }) => r.caseId === caseA1Id,
    );
    expect(row1.isOverdue).toBe(true);
    expect(row1.isReady).toBe(true);
    expect(row1.implantCount).toBe(2);
    expect(row1.implantSystems).toEqual(["Straumann"]);
    expect(row1.finance.finalTotal).toBe(1000);
    expect(row1.finance.paid).toBe(400);
    expect(row1.finance.remaining).toBe(600);
  });

  it("aggregates active adjunct procedures across a patient's active cases", async () => {
    const patient = await admin.post("/api/patients").send({
      fileNumber: "7003",
      fullName: "مريض ملخص الإجراءات",
    });
    const patientId = patient.body.patient.id as string;
    const firstCase = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({ procedureDate: TO });
    const secondCase = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({ procedureDate: TO });

    const createProcedure = async (
      caseId: string,
      procedureCategory: string,
    ) =>
      admin.post(`/api/implant-cases/${caseId}/bone-graft-procedures`).send({
        procedureDate: TO,
        procedureCategory,
        procedureType: `وصف ${procedureCategory}`,
      });

    await createProcedure(firstCase.body.case.id, "زراعة عظم");
    await createProcedure(firstCase.body.case.id, "زراعة عظم");
    const sinusLift = await createProcedure(
      secondCase.body.case.id,
      "رفع الجيب الفكي",
    );
    expect(sinusLift.status).toBe(400);

    const sidedSinusLift = await admin
      .post(`/api/implant-cases/${secondCase.body.case.id}/bone-graft-procedures`)
      .send({
        procedureDate: TO,
        procedureCategory: "رفع الجيب الفكي",
        procedureType: "وصف رفع الجيب",
        procedureSide: "يمين",
        liftType: "مغلق",
      });
    expect(sidedSinusLift.status).toBe(201);

    const beforeArchive = await admin.get(`/api/reports/operational?${RANGE}`);
    const patientRows = beforeArchive.body.rows.filter(
      (row: { patientId: string }) => row.patientId === patientId,
    );
    expect(patientRows).toHaveLength(2);
    for (const row of patientRows) {
      expect(row.implantStatuses).toEqual([]);
      expect(row.adjunctProcedureTypes).toEqual([
        "زراعة عظم",
        "زراعة عظم",
        "رفع الجيب الفكي",
      ]);
    }

    await admin
      .post(`/api/bone-graft-procedures/${sidedSinusLift.body.procedure.id}/archive`)
      .send();
    const afterArchive = await admin.get(`/api/reports/operational?${RANGE}`);
    const activeRow = afterArchive.body.rows.find(
      (row: { patientId: string }) => row.patientId === patientId,
    );
    expect(activeRow.adjunctProcedureTypes).toEqual([
      "زراعة عظم",
      "زراعة عظم",
    ]);

    await admin.post(`/api/patients/${patientId}/archive`).send();
  });

  it("hides financial columns from an assistant without permission", async () => {
    const res = await assistant.get(`/api/reports/operational?${RANGE}`);
    expect(res.status).toBe(200);
    expect(res.body.financialsIncluded).toBe(false);
    for (const row of res.body.rows) expect(row.finance).toBeNull();
  });

  it("respects the case-status filter", async () => {
    const res = await admin.get(
      `/api/reports/operational?${RANGE}&caseStatus=${encodeURIComponent("جاهز للتركيب")}`,
    );
    expect(res.body.rows).toHaveLength(1);
    expect(res.body.rows[0].caseId).toBe(caseA1Id);
  });
});

describe("GET /api/reports/operational/export.csv", () => {
  it("exports UTF-8 BOM CSV with finance columns for admin and audits it", async () => {
    const res = await admin.get(`/api/reports/operational/export.csv?${RANGE}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const text = res.text;
    expect(text.startsWith("\uFEFF")).toBe(true);
    expect(text).toContain("\r\n");
    expect(text).toContain("المتبقي");
    expect(text).toContain("مريض التقارير الأول");
    expect(text).not.toContain("مريض مؤرشف للتقارير");

    const audit = await pool.query(
      "SELECT count(*) FROM audit_logs WHERE action = 'report_export'",
    );
    expect(Number(audit.rows[0].count)).toBeGreaterThan(0);
  });

  it("omits finance columns for an assistant (no export bypass)", async () => {
    const res = await assistant.get(
      `/api/reports/operational/export.csv?${RANGE}`,
    );
    expect(res.status).toBe(200);
    expect(res.text).not.toContain("المتبقي");
    expect(res.text).not.toContain("حالة السداد");
  });

  it("requires authentication", async () => {
    const res = await agentFor(app).get(
      `/api/reports/operational/export.csv?${RANGE}`,
    );
    expect(res.status).toBe(401);
  });
});

describe("dashboard work summary", () => {
  it("counts distinct patients, implants, systems, and dated prosthetic events while excluding archived records", async () => {
    const todayCase = await admin
      .post(`/api/patients/${patientAId}/implant-cases`)
      .send({ procedureDate: TO });
    const todayCaseId = todayCase.body.case.id;

    const firstImplant = await admin
      .post(`/api/implant-cases/${todayCaseId}/implants`)
      .send({ site: "14", system: "Nobel Biocare" });
    const secondImplant = await admin
      .post(`/api/implant-cases/${todayCaseId}/implants`)
      .send({ site: "15", system: "Straumann" });

    await admin
      .post(`/api/implant-cases/${todayCaseId}/prosthetic-events`)
      .send({
        eventType: "تركيب مؤقت",
        eventDate: TO,
        implantId: firstImplant.body.implant.id,
      });
    await admin
      .post(`/api/implant-cases/${todayCaseId}/prosthetic-events`)
      .send({
        eventType: "تركيب دائم",
        eventDate: TO,
        implantId: secondImplant.body.implant.id,
      });
    const archivedImplant = await admin
      .post(`/api/implant-cases/${todayCaseId}/implants`)
      .send({ site: "16", system: "غير محسوب" });
    await admin
      .post(`/api/implant-cases/${todayCaseId}/prosthetic-events`)
      .send({
        eventType: "تركيب دائم",
        eventDate: TO,
        implantId: archivedImplant.body.implant.id,
      });
    await admin.post(`/api/implants/${archivedImplant.body.implant.id}/archive`);

    const res = await admin.get("/api/dashboard");
    expect(res.status).toBe(200);
    expect(res.body.workSummary.today).toEqual({
      implantedPatients: 1,
      implants: 2,
      implantSystems: {
        count: 2,
        names: expect.arrayContaining(["Nobel Biocare", "Straumann"]),
      },
      prostheticPatients: 1,
      completedProsthetics: 2,
    });
    // Month-to-date includes today's records and never leaks archived events.
    expect(res.body.workSummary.month.implantedPatients).toBeGreaterThanOrEqual(1);
    expect(res.body.workSummary.month.implants).toBeGreaterThanOrEqual(2);
    expect(res.body.workSummary.month.prostheticPatients).toBeGreaterThanOrEqual(1);
    expect(res.body.workSummary.month.completedProsthetics).toBeGreaterThanOrEqual(2);
  });
});
