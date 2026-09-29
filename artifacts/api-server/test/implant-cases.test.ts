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
let patientId: string;
let otherPatientId: string;

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);

  // Assistant user (no user-management endpoint yet — seed directly).
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ASSISTANT')`,
    ["assistant1", bcrypt.hashSync("Assist0Pass12", 10), "مساعدة العيادة"],
  );
  await attachUserToInternalTenant(pool, "assistant1", "ASSISTANT");
  assistant = agentFor(app);
  await login(assistant, "assistant1", "Assist0Pass12");

  const p1 = await admin.post("/api/patients").send({
    fileNumber: "7001",
    fullName: "مريض الزرعات الأول",
    mobileNumber: "0501112233",
  });
  patientId = p1.body.patient.id;
  const p2 = await admin.post("/api/patients").send({
    fileNumber: "7002",
    fullName: "مريض الزرعات الثاني",
  });
  otherPatientId = p2.body.patient.id;
});

afterAll(async () => {
  await pool.end();
});

describe("implant options", () => {
  it("requires authentication", async () => {
    const res = await agentFor(app).get("/api/implant-options");
    expect(res.status).toBe(401);
  });

  it("returns the seeded, admin-manageable option lists", async () => {
    const res = await admin.get("/api/implant-options");
    expect(res.status).toBe(200);
    expect(res.body.systems).toContain("Neodent");
    expect(res.body.systems).toContain("ROT / Root");
    expect(res.body.qValues).toContain("0");
    expect(res.body.qValues).toContain("80");
    expect(res.body.formerValues).toContain("MU30");
    expect(res.body.graftValues).toEqual(["N", "Y", "ALLO"]);
    expect(res.body.procedureTags).toContain("DIRECT");
    expect(res.body.procedureTags).toContain("مؤقت");
  });
});

describe("implant cases", () => {
  let caseId: string;
  let secondCaseId: string;

  it("creates a case with specification defaults", async () => {
    const res = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({});
    expect(res.status).toBe(201);
    expect(res.body.case.treatingDoctor).toBe("د. همام");
    expect(res.body.case.caseStatus).toBe("حالة جديدة");
    expect(res.body.case.status).toBe("active");
    caseId = res.body.case.id;
  });

  it("allows multiple cases per patient", async () => {
    const res = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({
        procedureDate: "2026-07-01",
        referringDoctor: "د. سارة",
        caseStatus: "تمت الزراعة",
        prosValue: "2M",
        expectedProstheticDate: "2026-09-01",
        generalNote: "ملاحظة عامة للحالة",
      });
    expect(res.status).toBe(201);
    expect(res.body.case.prosValue).toBe("2M");
    expect(res.body.case.expectedProstheticDate).toBe("2026-09-01");
    secondCaseId = res.body.case.id;

    const list = await admin.get(`/api/patients/${patientId}/implant-cases`);
    expect(list.status).toBe(200);
    expect(list.body.items).toHaveLength(2);
    expect(Array.isArray(list.body.items[0].implants)).toBe(true);
  });

  it("rejects an unknown case status", async () => {
    const res = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({ caseStatus: "حالة غير معروفة" });
    expect(res.status).toBe(400);
  });

  it("updates a case, including a custom Pros value", async () => {
    const res = await admin.patch(`/api/implant-cases/${caseId}`).send({
      caseStatus: "مرحلة الالتئام",
      prosValue: "4 أشهر",
    });
    expect(res.status).toBe(200);
    expect(res.body.case.caseStatus).toBe("مرحلة الالتئام");
    expect(res.body.case.prosValue).toBe("4 أشهر");
  });

  it("validates the reimplantation source case", async () => {
    // Case of a different patient is rejected.
    const foreign = await admin
      .post(`/api/patients/${otherPatientId}/implant-cases`)
      .send({});
    const badSource = await admin.patch(`/api/implant-cases/${caseId}`).send({
      isReimplantation: true,
      reimplantationReason: "فشل الزرعة السابقة",
      sourceCaseId: foreign.body.case.id,
    });
    expect(badSource.status).toBe(400);
    expect(badSource.body.code).toBe("SOURCE_CASE_INVALID");

    // Self-link is rejected.
    const selfLink = await admin.patch(`/api/implant-cases/${caseId}`).send({
      isReimplantation: true,
      sourceCaseId: caseId,
    });
    expect(selfLink.status).toBe(400);

    // A sibling case of the same patient is accepted.
    const ok = await admin.patch(`/api/implant-cases/${caseId}`).send({
      isReimplantation: true,
      reimplantationReason: "فشل الزرعة السابقة",
      sourceCaseId: secondCaseId,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.case.isReimplantation).toBe(true);
    expect(ok.body.case.sourceCaseId).toBe(secondCaseId);

    // Turning the flag off clears the linked fields.
    const off = await admin.patch(`/api/implant-cases/${caseId}`).send({
      isReimplantation: false,
    });
    expect(off.body.case.sourceCaseId).toBeNull();
    expect(off.body.case.reimplantationReason).toBeNull();
  });

  it("archives and restores a case (idempotently)", async () => {
    const archived = await admin.post(
      `/api/implant-cases/${secondCaseId}/archive`,
    );
    expect(archived.status).toBe(200);
    expect(archived.body.case.status).toBe("archived");

    const editBlocked = await admin
      .patch(`/api/implant-cases/${secondCaseId}`)
      .send({ generalNote: "تعديل ممنوع" });
    expect(editBlocked.status).toBe(409);
    expect(editBlocked.body.code).toBe("CASE_ARCHIVED");

    const addBlocked = await admin
      .post(`/api/implant-cases/${secondCaseId}/implants`)
      .send({ site: "11" });
    expect(addBlocked.status).toBe(409);
    expect(addBlocked.body.code).toBe("CASE_ARCHIVED");

    const restored = await admin.post(
      `/api/implant-cases/${secondCaseId}/restore`,
    );
    expect(restored.status).toBe(200);
    expect(restored.body.case.status).toBe("active");
  });

  it("writes audit records for case actions", async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'implant_case' ORDER BY created_at`,
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("implant_case_create");
    expect(actions).toContain("implant_case_update");
    expect(actions).toContain("implant_case_archive");
    expect(actions).toContain("implant_case_restore");
  });
});

describe("implants", () => {
  let caseId: string;
  let implantId: string;

  beforeAll(async () => {
    const res = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({ procedureDate: "2026-07-15" });
    caseId = res.body.case.id;
  });

  it("creates one record per implant with decimals, legacy values, and tags", async () => {
    const res = await admin.post(`/api/implant-cases/${caseId}/implants`).send({
      site: "36",
      system: "Neodent",
      diameter: 3.5,
      length: 10,
      qValue: "25",
      formerValue: "M17",
      graftValue: "Y",
      graftProcedureType: "ترقيع ذاتي",
      graftNote: "ملاحظة الترقيع",
      procedureTags: ["DIRECT", "IMMED", "وسم مخصص"],
    });
    expect(res.status).toBe(201);
    expect(res.body.implant.site).toBe("36");
    expect(res.body.implant.diameter).toBe(3.5);
    expect(res.body.implant.length).toBe(10);
    expect(res.body.implant.implantStatus).toBe("مزروعة");
    expect(res.body.implant.immediatePlacement).toBe("UNSPECIFIED");
    expect(res.body.implant.formerValue).toBe("M17");
    expect(res.body.implant.procedureTags).toEqual([
      "DIRECT",
      "IMMED",
      "وسم مخصص",
    ]);
    implantId = res.body.implant.id;
  });

  it("accepts custom values for System, Q, Former, and Graft", async () => {
    const res = await admin.post(`/api/implant-cases/${caseId}/implants`).send({
      site: "21",
      system: "نظام مخصص جديد",
      qValue: "قيمة خاصة",
      formerValue: "XX9",
      graftValue: "قيمة ترقيع مخصصة",
    });
    expect(res.status).toBe(201);
    expect(res.body.implant.system).toBe("نظام مخصص جديد");
    expect(res.body.implant.graftValue).toBe("قيمة ترقيع مخصصة");
  });

  it("keeps Immediate independent of Former, tags, and unrelated edits", async () => {
    const created = await admin.post(`/api/implant-cases/${caseId}/implants`).send({
      site: "22",
      formerValue: "MST",
      procedureTags: ["IMMED"],
      immediatePlacement: "YES",
    });
    expect(created.status).toBe(201);
    expect(created.body.implant.immediatePlacement).toBe("YES");
    expect(created.body.implant.formerValue).toBe("MST");

    const changed = await admin.patch(`/api/implants/${created.body.implant.id}`).send({
      formerValue: "N",
      immediatePlacement: "NO",
    });
    expect(changed.status).toBe(200);
    expect(changed.body.implant.immediatePlacement).toBe("NO");
    expect(changed.body.implant.formerValue).toBe("N");
    const unrelated = await admin.patch(`/api/implants/${created.body.implant.id}`).send({
      implantNote: "reviewed",
    });
    expect(unrelated.body.implant.immediatePlacement).toBe("NO");
    const listed = await admin.get(`/api/patients/${patientId}/implant-cases`);
    expect(listed.body.items.find((c: { id: string }) => c.id === caseId)
      .implants.find((i: { id: string }) => i.id === created.body.implant.id)
      .immediatePlacement).toBe("NO");
    const invalid = await admin.patch(`/api/implants/${created.body.implant.id}`).send({
      immediatePlacement: "IMMED",
    });
    expect(invalid.status).toBe(400);
  });

  it("rejects a non-FDI site", async () => {
    const res = await admin
      .post(`/api/implant-cases/${caseId}/implants`)
      .send({ site: "99" });
    expect(res.status).toBe(400);
  });

  it("blocks a duplicate active site in the same case", async () => {
    const res = await admin
      .post(`/api/implant-cases/${caseId}/implants`)
      .send({ site: "36" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("DUPLICATE_SITE");
  });

  it("blocks duplicate sites even under truly parallel requests", async () => {
    const [a, b] = await Promise.all([
      admin.post(`/api/implant-cases/${caseId}/implants`).send({ site: "14" }),
      admin.post(`/api/implant-cases/${caseId}/implants`).send({ site: "14" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([201, 409]);
  });

  it("supports copy-to-another-tooth (same data, new site; original untouched)", async () => {
    const copy = await admin.post(`/api/implant-cases/${caseId}/implants`).send({
      site: "46",
      system: "Neodent",
      diameter: 3.5,
      length: 10,
      qValue: "25",
      formerValue: "M17",
      graftValue: "Y",
      procedureTags: ["DIRECT", "IMMED", "وسم مخصص"],
    });
    expect(copy.status).toBe(201);
    expect(copy.body.implant.site).toBe("46");

    const list = await admin.get(`/api/patients/${patientId}/implant-cases`);
    const caseItem = list.body.items.find(
      (c: { id: string }) => c.id === caseId,
    );
    const original = caseItem.implants.find(
      (i: { id: string }) => i.id === implantId,
    );
    expect(original.site).toBe("36");
    expect(original.system).toBe("Neodent");
  });

  it("edits an implant but blocks moving it onto an occupied site", async () => {
    const blocked = await admin
      .patch(`/api/implants/${implantId}`)
      .send({ site: "21" });
    expect(blocked.status).toBe(409);
    expect(blocked.body.code).toBe("DUPLICATE_SITE");

    const ok = await admin.patch(`/api/implants/${implantId}`).send({
      implantStatus: "مرحلة الالتئام",
      implantNote: "ملاحظة محدثة",
      diameter: 4.25,
    });
    expect(ok.status).toBe(200);
    expect(ok.body.implant.implantStatus).toBe("مرحلة الالتئام");
    expect(ok.body.implant.diameter).toBe(4.25);
  });

  it("allows reimplantation on the same site after a failure", async () => {
    const failed = await admin
      .patch(`/api/implants/${implantId}`)
      .send({ implantStatus: "فاشلة" });
    expect(failed.status).toBe(200);

    const again = await admin
      .post(`/api/implant-cases/${caseId}/implants`)
      .send({ site: "36", system: "Bio" });
    expect(again.status).toBe(201);

    // The failed implant cannot silently become active again on that site.
    const revive = await admin
      .patch(`/api/implants/${implantId}`)
      .send({ implantStatus: "مزروعة" });
    expect(revive.status).toBe(409);
    expect(revive.body.code).toBe("DUPLICATE_SITE");
  });

  it("archives an implant (admin) and blocks editing it afterwards", async () => {
    const archived = await admin.post(`/api/implants/${implantId}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.implant.status).toBe("archived");
    expect(archived.body.implant.implantStatus).toBe("مؤرشفة");

    const editBlocked = await admin
      .patch(`/api/implants/${implantId}`)
      .send({ implantNote: "تعديل ممنوع" });
    expect(editBlocked.status).toBe(409);
    expect(editBlocked.body.code).toBe("IMPLANT_ARCHIVED");
  });

  it("writes audit records for implant actions", async () => {
    const { rows } = await pool.query(
      `SELECT action FROM audit_logs WHERE entity_type = 'implant' ORDER BY created_at`,
    );
    const actions = rows.map((r) => r.action);
    expect(actions).toContain("implant_create");
    expect(actions).toContain("implant_update");
    expect(actions).toContain("implant_archive");
  });
});

describe("role authorization", () => {
  let caseId: string;
  let implantId: string;

  it("lets an ASSISTANT create/update cases and add/update implants", async () => {
    const created = await assistant
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({ generalNote: "حالة من المساعدة" });
    expect(created.status).toBe(201);
    caseId = created.body.case.id;

    const caseUpdated = await assistant
      .patch(`/api/implant-cases/${caseId}`)
      .send({ caseStatus: "تمت الزراعة" });
    expect(caseUpdated.status).toBe(200);
    expect(caseUpdated.body.case.caseStatus).toBe("تمت الزراعة");

    const implant = await assistant
      .post(`/api/implant-cases/${caseId}/implants`)
      .send({ site: "13", system: "Ora" });
    expect(implant.status).toBe(201);
    implantId = implant.body.implant.id;

    const updated = await assistant
      .patch(`/api/implants/${implantId}`)
      .send({ implantNote: "تحديث من المساعدة" });
    expect(updated.status).toBe(200);
  });

  it("forbids an ASSISTANT from archiving cases or implants", async () => {
    const caseArchive = await assistant.post(
      `/api/implant-cases/${caseId}/archive`,
    );
    expect(caseArchive.status).toBe(403);

    const implantArchive = await assistant.post(
      `/api/implants/${implantId}/archive`,
    );
    expect(implantArchive.status).toBe(403);

    const caseRestore = await assistant.post(
      `/api/implant-cases/${caseId}/restore`,
    );
    expect(caseRestore.status).toBe(403);
  });
});

describe("archived patient guard", () => {
  let archPatientId: string;
  let archCaseId: string;
  let archImplantId: string;

  beforeAll(async () => {
    const p = await admin.post("/api/patients").send({
      fileNumber: "7003",
      fullName: "مريض مؤرشف للزرعات",
    });
    archPatientId = p.body.patient.id;
    const c = await admin
      .post(`/api/patients/${archPatientId}/implant-cases`)
      .send({});
    archCaseId = c.body.case.id;
    const i = await admin
      .post(`/api/implant-cases/${archCaseId}/implants`)
      .send({ site: "16" });
    archImplantId = i.body.implant.id;
    const archived = await admin.post(`/api/patients/${archPatientId}/archive`);
    expect(archived.status).toBe(200);
  });

  it("blocks every implant write while the patient file is archived", async () => {
    const caseCreate = await admin
      .post(`/api/patients/${archPatientId}/implant-cases`)
      .send({});
    expect(caseCreate.status).toBe(409);
    expect(caseCreate.body.code).toBe("PATIENT_ARCHIVED");

    const caseUpdate = await admin
      .patch(`/api/implant-cases/${archCaseId}`)
      .send({ generalNote: "تعديل ممنوع" });
    expect(caseUpdate.status).toBe(409);
    expect(caseUpdate.body.code).toBe("PATIENT_ARCHIVED");

    const caseArchive = await admin.post(
      `/api/implant-cases/${archCaseId}/archive`,
    );
    expect(caseArchive.status).toBe(409);
    expect(caseArchive.body.code).toBe("PATIENT_ARCHIVED");

    const implantCreate = await admin
      .post(`/api/implant-cases/${archCaseId}/implants`)
      .send({ site: "26" });
    expect(implantCreate.status).toBe(409);
    expect(implantCreate.body.code).toBe("PATIENT_ARCHIVED");

    const implantUpdate = await admin
      .patch(`/api/implants/${archImplantId}`)
      .send({ implantNote: "تعديل ممنوع" });
    expect(implantUpdate.status).toBe(409);
    expect(implantUpdate.body.code).toBe("PATIENT_ARCHIVED");

    const implantArchive = await admin.post(
      `/api/implants/${archImplantId}/archive`,
    );
    expect(implantArchive.status).toBe(409);
    expect(implantArchive.body.code).toBe("PATIENT_ARCHIVED");
  });

  it("allows writes again after the patient file is restored", async () => {
    const restored = await admin.post(`/api/patients/${archPatientId}/restore`);
    expect(restored.status).toBe(200);

    const implantUpdate = await admin
      .patch(`/api/implants/${archImplantId}`)
      .send({ implantNote: "تعديل بعد الاستعادة" });
    expect(implantUpdate.status).toBe(200);
  });
});
