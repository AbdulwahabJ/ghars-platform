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
/** Assistant without any financial permission. */
let assistantNone: TestAgent;
/** Assistant explicitly allowed to record payments. */
let assistantPay: TestAgent;
/** Doctor without financial visibility (role default). */
let doctorNoFin: TestAgent;
/** Doctor with financial visibility explicitly enabled. */
let doctorFin: TestAgent;

let patientId: string;
let caseId: string;
let implantId: string;
let otherCaseImplantId: string;

async function seedUser(
  username: string,
  role: "DOCTOR" | "ASSISTANT",
  overrides: { canViewFinancials?: boolean; canRecordPayments?: boolean } = {},
): Promise<TestAgent> {
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role, can_view_financials, can_record_payments)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      username,
      bcrypt.hashSync("Fin0TestPass12", 10),
      `مستخدم ${username}`,
      role,
      overrides.canViewFinancials ?? null,
      overrides.canRecordPayments ?? null,
    ],
  );
  const agent = agentFor(app);
  await login(agent, username, "Fin0TestPass12");
  return agent;
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  assistantNone = await seedUser("fin-assist-none", "ASSISTANT");
  assistantPay = await seedUser("fin-assist-pay", "ASSISTANT", {
    canRecordPayments: true,
  });
  doctorNoFin = await seedUser("fin-doc-plain", "DOCTOR");
  doctorFin = await seedUser("fin-doc-fin", "DOCTOR", {
    canViewFinancials: true,
  });

  const p = await admin.post("/api/patients").send({
    fileNumber: "9001",
    fullName: "مريض الاختبار المالي",
  });
  patientId = p.body.patient.id;

  const c = await admin.post(`/api/patients/${patientId}/implant-cases`).send({});
  caseId = c.body.case.id;
  const imp = await admin
    .post(`/api/implant-cases/${caseId}/implants`)
    .send({ site: "36" });
  implantId = imp.body.implant.id;

  // A second case with its own implant (for the cross-case link check).
  const c2 = await admin
    .post(`/api/patients/${patientId}/implant-cases`)
    .send({});
  const imp2 = await admin
    .post(`/api/implant-cases/${c2.body.case.id}/implants`)
    .send({ site: "46" });
  otherCaseImplantId = imp2.body.implant.id;
});

afterAll(async () => {
  await pool.end();
});

describe("financial permissions (backend-enforced)", () => {
  it("rejects unauthenticated access", async () => {
    const res = await agentFor(app).get(`/api/implant-cases/${caseId}/finance`);
    expect(res.status).toBe(401);
  });

  it("assistant without permissions cannot read case finance or record payments", async () => {
    const read = await assistantNone.get(`/api/implant-cases/${caseId}/finance`);
    expect(read.status).toBe(403);
    const pay = await assistantNone
      .post(`/api/implant-cases/${caseId}/payments`)
      .send({ amount: 100, paymentDate: "2026-08-01", paymentLabel: "دفعة أولى", paymentMethod: "نقدي" });
    expect(pay.status).toBe(403);
  });

  it("doctor without financial visibility cannot access the finance page", async () => {
    const res = await doctorNoFin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31",
    );
    expect(res.status).toBe(403);
  });

  it("doctor with financial visibility can access the finance page", async () => {
    const res = await doctorFin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31",
    );
    expect(res.status).toBe(200);
  });

  it("payment-recording assistant can read case finance but not the clinic-wide page", async () => {
    const read = await assistantPay.get(`/api/implant-cases/${caseId}/finance`);
    expect(read.status).toBe(200);
    const page = await assistantPay.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31",
    );
    expect(page.status).toBe(403);
  });

  it("payment-recording assistant cannot manage charges, discounts, or base amount", async () => {
    const charge = await assistantPay
      .post(`/api/implant-cases/${caseId}/charges`)
      .send({ chargeType: "ضريبة", amount: 10, chargeDate: "2026-08-01" });
    expect(charge.status).toBe(403);
    const discount = await assistantPay
      .post(`/api/implant-cases/${caseId}/discounts`)
      .send({ amount: 10, discountDate: "2026-08-01", reason: "اختبار" });
    expect(discount.status).toBe(403);
    const base = await assistantPay
      .patch(`/api/implant-cases/${caseId}/base-amount`)
      .send({ baseTreatmentAmount: 5 });
    expect(base.status).toBe(403);
  });
});

describe("financial computation", () => {
  it("sets the base treatment amount", async () => {
    const res = await admin
      .patch(`/api/implant-cases/${caseId}/base-amount`)
      .send({ baseTreatmentAmount: 6000 });
    expect(res.status).toBe(200);
    expect(res.body.baseTreatmentAmount).toBe(6000);
  });

  it("adds multiple charges, one linked to an implant of the same case", async () => {
    const c1 = await admin.post(`/api/implant-cases/${caseId}/charges`).send({
      chargeType: "زراعة عظم",
      amount: 800.5,
      chargeDate: "2026-08-01",
      implantId,
    });
    expect(c1.status).toBe(201);
    expect(c1.body.charge.implantSite).toBe("36");

    const c2 = await admin.post(`/api/implant-cases/${caseId}/charges`).send({
      chargeType: "ضريبة",
      amount: 199.5,
      chargeDate: "2026-08-02",
    });
    expect(c2.status).toBe(201);
  });

  it("rejects a charge linked to an implant of another case", async () => {
    const res = await admin.post(`/api/implant-cases/${caseId}/charges`).send({
      chargeType: "إجراء إضافي",
      amount: 100,
      chargeDate: "2026-08-02",
      implantId: otherCaseImplantId,
    });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("CHARGE_IMPLANT_INVALID");
  });

  it("adds a discount (reason required)", async () => {
    const missing = await admin
      .post(`/api/implant-cases/${caseId}/discounts`)
      .send({ amount: 500, discountDate: "2026-08-03" });
    expect(missing.status).toBe(400);

    const res = await admin.post(`/api/implant-cases/${caseId}/discounts`).send({
      amount: 500,
      discountDate: "2026-08-03",
      reason: "خصم موافقة الإدارة",
    });
    expect(res.status).toBe(201);
    expect(res.body.discount.approvedByName).toBeTruthy();
  });

  it("computes final total, paid, outstanding, and partial status after payments", async () => {
    const p1 = await admin.post(`/api/implant-cases/${caseId}/payments`).send({
      amount: 2000,
      paymentDate: "2026-08-05",
      paymentLabel: "دفعة أولى",
      paymentMethod: "شبكة",
      referenceNumber: "REF-1",
    });
    expect(p1.status).toBe(201);

    // Payment recorded by the permitted assistant also counts.
    const p2 = await assistantPay
      .post(`/api/implant-cases/${caseId}/payments`)
      .send({
        amount: 1500,
        paymentDate: "2026-08-10",
        paymentLabel: "دفعة ثانية",
        paymentMethod: "نقدي",
      });
    expect(p2.status).toBe(201);

    const res = await admin.get(`/api/implant-cases/${caseId}/finance`);
    expect(res.status).toBe(200);
    const s = res.body.summary;
    // 6000 + (800.50 + 199.50) - 500 = 6500
    expect(s.baseTreatmentAmount).toBe(6000);
    expect(s.chargesTotal).toBe(1000);
    expect(s.discountsTotal).toBe(500);
    expect(s.finalTotal).toBe(6500);
    expect(s.paidAmount).toBe(3500);
    expect(s.outstanding).toBe(3000);
    expect(s.paymentStatus).toBe("مدفوع جزئيًا");
    expect(s.isOverpaid).toBe(false);
    expect(s.paymentPercent).toBeCloseTo(53.8, 1);
  });

  it("flags overpayment without altering totals", async () => {
    const p = await admin.post(`/api/implant-cases/${caseId}/payments`).send({
      amount: 4000,
      paymentDate: "2026-08-15",
      paymentLabel: "دفعة إضافية",
      paymentMethod: "تحويل",
    });
    expect(p.status).toBe(201);

    const res = await admin.get(`/api/implant-cases/${caseId}/finance`);
    const s = res.body.summary;
    expect(s.finalTotal).toBe(6500);
    expect(s.paidAmount).toBe(7500);
    expect(s.outstanding).toBe(-1000);
    expect(s.paymentStatus).toBe("رصيد زائد");
    expect(s.isOverpaid).toBe(true);
  });

  it("voids a payment with a required reason and recalculates", async () => {
    const finance = await admin.get(`/api/implant-cases/${caseId}/finance`);
    const overpay = finance.body.payments.find(
      (p: { amount: number }) => p.amount === 4000,
    );
    expect(overpay).toBeTruthy();

    const noReason = await admin.post(`/api/payments/${overpay.id}/void`).send({});
    expect(noReason.status).toBe(400);

    const assistantVoid = await assistantPay
      .post(`/api/payments/${overpay.id}/void`)
      .send({ reason: "غير مصرح" });
    expect(assistantVoid.status).toBe(403);

    const res = await admin
      .post(`/api/payments/${overpay.id}/void`)
      .send({ reason: "دفعة مسجلة بالخطأ" });
    expect(res.status).toBe(200);
    expect(res.body.payment.isVoided).toBe(true);
    expect(res.body.payment.voidReason).toBe("دفعة مسجلة بالخطأ");

    const again = await admin
      .post(`/api/payments/${overpay.id}/void`)
      .send({ reason: "تكرار" });
    expect(again.status).toBe(409);

    const after = await admin.get(`/api/implant-cases/${caseId}/finance`);
    const s = after.body.summary;
    expect(s.paidAmount).toBe(3500);
    expect(s.outstanding).toBe(3000);
    expect(s.paymentStatus).toBe("مدفوع جزئيًا");
    // The voided payment stays visible in the record.
    const voided = after.body.payments.find(
      (p: { id: string }) => p.id === overpay.id,
    );
    expect(voided.isVoided).toBe(true);
  });

  it("marks a deferred case as financially deferred", async () => {
    const c = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({ caseStatus: "مؤجل" });
    const deferredCaseId = c.body.case.id;
    await admin
      .patch(`/api/implant-cases/${deferredCaseId}/base-amount`)
      .send({ baseTreatmentAmount: 1000 });
    const res = await admin.get(`/api/implant-cases/${deferredCaseId}/finance`);
    expect(res.body.summary.paymentStatus).toBe("مؤجل ماليًا");
  });

  it("blocks payments on cases of archived patients", async () => {
    const p = await admin.post("/api/patients").send({
      fileNumber: "9002",
      fullName: "مريض مؤرشف ماليًا",
    });
    const c = await admin
      .post(`/api/patients/${p.body.patient.id}/implant-cases`)
      .send({});
    await admin.post(`/api/patients/${p.body.patient.id}/archive`);
    const res = await admin
      .post(`/api/implant-cases/${c.body.case.id}/payments`)
      .send({
        amount: 50,
        paymentDate: "2026-08-01",
        paymentLabel: "دفعة أولى",
        paymentMethod: "نقدي",
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PATIENT_ARCHIVED");
  });
});

describe("finance page and export", () => {
  it("collects revenue by payment date only (period filter)", async () => {
    const res = await admin.get(
      "/api/finance/overview?from=2026-08-05&to=2026-08-05",
    );
    expect(res.status).toBe(200);
    // Only the 2000 payment dated 2026-08-05; the 1500 (08-10) and the
    // voided 4000 (08-15) are excluded.
    expect(res.body.kpis.collectedInPeriod).toBe(2000);
    expect(res.body.kpis.paymentsCount).toBe(1);
  });

  it("excludes voided payments from totals and rows", async () => {
    const res = await admin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31",
    );
    expect(res.body.kpis.collectedInPeriod).toBe(3500);
    expect(res.body.kpis.paymentsCount).toBe(2);
    const amounts = res.body.payments.map((p: { amount: number }) => p.amount);
    expect(amounts).not.toContain(4000);
    // Outstanding is a live balance: 3000 (main case) + 1000 (deferred case).
    expect(res.body.kpis.totalOutstanding).toBe(4000);
    expect(res.body.kpis.patientsWithBalanceCount).toBe(1);
    expect(res.body.kpis.chargesInPeriod).toBe(1000);
    expect(res.body.kpis.discountsInPeriod).toBe(500);
  });

  it("filters by payment method and file number", async () => {
    const byMethod = await admin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31&paymentMethod=نقدي",
    );
    expect(byMethod.body.kpis.collectedInPeriod).toBe(1500);
    expect(byMethod.body.payments).toHaveLength(1);
    expect(byMethod.body.payments[0].paymentMethod).toBe("نقدي");

    const byFile = await admin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31&fileNumber=0000",
    );
    expect(byFile.body.kpis.collectedInPeriod).toBe(0);
    expect(byFile.body.payments).toHaveLength(0);
  });

  it("filters by implant system", async () => {
    await admin.patch(`/api/implants/${implantId}`).send({ system: "Neodent" });
    const match = await admin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31&implantSystem=Neodent",
    );
    expect(match.body.kpis.collectedInPeriod).toBe(3500);
    const noMatch = await admin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31&implantSystem=Straumann",
    );
    expect(noMatch.body.kpis.collectedInPeriod).toBe(0);
  });

  it("builds the collection chart grouped by day for short ranges", async () => {
    const res = await admin.get(
      "/api/finance/overview?from=2026-08-01&to=2026-08-31",
    );
    expect(res.body.collectionGrouping).toBe("day");
    expect(res.body.collectionSeries).toEqual([
      { bucket: "2026-08-05", amount: 2000 },
      { bucket: "2026-08-10", amount: 1500 },
    ]);
    const methods = Object.fromEntries(
      res.body.methodDistribution.map((m: { method: string; amount: number }) => [
        m.method,
        m.amount,
      ]),
    );
    expect(methods["شبكة"]).toBe(2000);
    expect(methods["نقدي"]).toBe(1500);
  });

  it("exports CSV respecting the active filters", async () => {
    const res = await admin.get(
      "/api/finance/export.csv?from=2026-08-01&to=2026-08-31&paymentMethod=شبكة",
    );
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/csv");
    const text = res.text;
    expect(text).toContain("التاريخ");
    expect(text).toContain("مريض الاختبار المالي");
    expect(text).toContain("2000.00");
    expect(text).not.toContain("1500.00");
    // Export requires the financial-view permission.
    const forbidden = await assistantPay.get(
      "/api/finance/export.csv?from=2026-08-01&to=2026-08-31",
    );
    expect(forbidden.status).toBe(403);
  });

  it("creates a schedule, links partial payments, and prevents installment overpayment", async () => {
    const patient = await admin.post("/api/patients").send({
      fileNumber: "9019",
      fullName: "مريض خطة التقسيط",
    });
    const planCase = await admin
      .post(`/api/patients/${patient.body.patient.id}/implant-cases`)
      .send({});
    const planCaseId = planCase.body.case.id as string;
    await admin
      .patch(`/api/implant-cases/${planCaseId}/base-amount`)
      .send({ baseTreatmentAmount: 1000 });

    const created = await admin
      .put(`/api/implant-cases/${planCaseId}/installment-plan`)
      .send({
        totalAmount: 1000,
        installmentCount: 3,
        firstDueDate: "2026-08-31",
      });
    expect(created.status).toBe(200);
    expect(created.body.installmentPlan.installments).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ sequence: 1, dueDate: "2026-08-31", amount: 333.34 }),
        expect.objectContaining({ sequence: 2, dueDate: "2026-09-30", amount: 333.33 }),
      ]),
    );

    const firstInstallment = created.body.installmentPlan.installments[0];
    const partial = await admin.post(`/api/implant-cases/${planCaseId}/payments`).send({
      amount: 100,
      paymentDate: "2026-08-01",
      paymentLabel: "دفعة إضافية",
      paymentMethod: "نقدي",
      installmentId: firstInstallment.id,
    });
    expect(partial.status).toBe(201);
    expect(partial.body.payment.installmentId).toBe(firstInstallment.id);

    const finance = await admin.get(`/api/implant-cases/${planCaseId}/finance`);
    const first = finance.body.installmentPlan.installments[0];
    expect(first.paidAmount).toBe(100);
    expect(first.outstanding).toBe(233.34);
    expect(first.status).toBe("مدفوع جزئيًا");

    const excess = await admin.post(`/api/implant-cases/${planCaseId}/payments`).send({
      amount: 250,
      paymentDate: "2026-08-02",
      paymentLabel: "دفعة إضافية",
      paymentMethod: "نقدي",
      installmentId: firstInstallment.id,
    });
    expect(excess.status).toBe(409);

    const forbidden = await assistantPay
      .put(`/api/implant-cases/${planCaseId}/installment-plan`)
      .send({ totalAmount: 1000, installmentCount: 2, firstDueDate: "2026-08-31" });
    expect(forbidden.status).toBe(403);
  });
});
