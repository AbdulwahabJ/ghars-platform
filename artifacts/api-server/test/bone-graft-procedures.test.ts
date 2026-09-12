import { afterAll, beforeAll, describe, expect, it } from "vitest";
import app from "../src/app";
import { freshAdminSession, makePool, type TestAgent } from "./helpers";

const pool = makePool();
let admin: TestAgent;
let patientId: string;
let caseId: string;
let secondCaseId: string;
let implantId: string;
let foreignImplantId: string;

const procedurePayload = {
  procedureDate: "2026-08-22",
  procedureCategory: "زراعة عظم",
  procedureType: "ترقيع عظمي",
  site: "36",
  material: "عظم صناعي",
  membrane: "كولاجين",
  quantity: "1 cc",
  size: null,
  treatingDoctor: "د. همام",
  procedureStatus: "تم",
  note: "ملاحظة اختبار",
};

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  const patient = await admin.post("/api/patients").send({
    fileNumber: "8801",
    fullName: "مريض إجراءات العظم",
  });
  patientId = patient.body.patient.id;
  const firstCase = await admin.post(`/api/patients/${patientId}/implant-cases`).send({});
  caseId = firstCase.body.case.id;
  await pool.query(
    "UPDATE implant_cases SET procedure_date = $2 WHERE id = $1",
    [caseId, procedurePayload.procedureDate],
  );
  const secondCase = await admin.post(`/api/patients/${patientId}/implant-cases`).send({});
  secondCaseId = secondCase.body.case.id;
  implantId = (await admin.post(`/api/implant-cases/${caseId}/implants`).send({ site: "36" })).body.implant.id;
  foreignImplantId = (await admin.post(`/api/implant-cases/${secondCaseId}/implants`).send({ site: "46" })).body.implant.id;
});

afterAll(async () => {
  await pool.end();
});

describe("bone graft procedures", () => {
  let procedureId: string;

  it("creates, updates, lists, and archives a canonical procedure", async () => {
    const created = await admin
      .post(`/api/implant-cases/${caseId}/bone-graft-procedures`)
      .send({ ...procedurePayload, implantId });
    expect(created.status).toBe(201);
    expect(created.body.procedure.implantId).toBe(implantId);
    procedureId = created.body.procedure.id;

    const updated = await admin
      .patch(`/api/bone-graft-procedures/${procedureId}`)
      .send({ procedureStatus: "مخطط", note: "تعديل اختبار" });
    expect(updated.status).toBe(200);
    expect(updated.body.procedure.procedureStatus).toBe("مخطط");

    const list = await admin.get(`/api/patients/${patientId}/implant-cases`);
    expect(list.status).toBe(200);
    expect(list.body.items.find((item: { id: string }) => item.id === caseId).boneGraftProcedures).toHaveLength(1);
    const beforeArchiveStats = await admin.get("/api/statistics?from=2026-08-01&to=2026-08-31");
    expect(beforeArchiveStats.status).toBe(200);
    expect(beforeArchiveStats.body.hub.overview.boneGraftProcedures).toBe(1);
    const operational = await admin.get("/api/reports/operational?from=2026-08-01&to=2026-08-31");
    expect(operational.status).toBe(200);
    expect(operational.body.rows.find((row: { caseId: string }) => row.caseId === caseId).boneGraftProcedureCount).toBe(1);

    const archived = await admin.post(`/api/bone-graft-procedures/${procedureId}/archive`).send();
    expect(archived.status).toBe(200);
    expect(archived.body.procedure.status).toBe("archived");
    const activeList = await admin.get(`/api/patients/${patientId}/implant-cases`);
    expect(activeList.body.items.find((item: { id: string }) => item.id === caseId).boneGraftProcedures).toHaveLength(0);
    const afterArchiveStats = await admin.get("/api/statistics?from=2026-08-01&to=2026-08-31");
    expect(afterArchiveStats.body.hub.overview.boneGraftProcedures).toBe(0);
  });

  it("rejects a linked implant belonging to another case", async () => {
    const response = await admin
      .post(`/api/implant-cases/${caseId}/bone-graft-procedures`)
      .send({ ...procedurePayload, implantId: foreignImplantId });
    expect(response.status).toBe(400);
    expect(response.body.code).toBe("BONE_GRAFT_PROCEDURE_IMPLANT_INVALID");
  });

  it("blocks writes on archived cases and patients", async () => {
    await admin.post(`/api/implant-cases/${secondCaseId}/archive`).send();
    const caseBlocked = await admin
      .post(`/api/implant-cases/${secondCaseId}/bone-graft-procedures`)
      .send(procedurePayload);
    expect(caseBlocked.status).toBe(409);
    expect(caseBlocked.body.code).toBe("CASE_ARCHIVED");

    await admin.post(`/api/patients/${patientId}/archive`).send();
    const patientBlocked = await admin
      .post(`/api/implant-cases/${caseId}/bone-graft-procedures`)
      .send(procedurePayload);
    expect(patientBlocked.status).toBe(409);
    expect(patientBlocked.body.code).toBe("PATIENT_ARCHIVED");
  });

  it("creates a case with a graft procedure and no implants via quick entry", async () => {
    const response = await admin.post("/api/quick-entry").send({
      patient: { fileNumber: "8802", fullName: "مريض إدخال سريع" },
      case: { treatingDoctor: "د. همام", caseStatus: "حالة جديدة", isReimplantation: false },
      implants: [],
      boneGraftProcedures: [
        { ...procedurePayload, implantIndex: undefined },
        {
          ...procedurePayload,
          procedureCategory: "رفع الجيب الفكي",
          procedureType: "رفع مغلق",
          procedureSide: "يمين",
          liftType: "مغلق",
          implantIndex: undefined,
        },
        {
          ...procedurePayload,
          procedureCategory: "إبعاد / نقل العصب السنخي السفلي",
          procedureType: "نقل العصب",
          procedureSide: "يسار",
          implantIndex: undefined,
        },
      ],
    });
    expect(response.status).toBe(201);
    expect(response.body.implants).toHaveLength(0);
    expect(response.body.boneGraftProcedures).toHaveLength(3);
    expect(response.body.boneGraftProcedures).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          procedureCategory: "زراعة عظم",
          implantId: null,
        }),
        expect.objectContaining({
          procedureCategory: "رفع الجيب الفكي",
          procedureSide: "يمين",
          liftType: "مغلق",
          implantId: null,
        }),
        expect.objectContaining({
          procedureCategory: "إبعاد / نقل العصب السنخي السفلي",
          procedureSide: "يسار",
          implantId: null,
        }),
      ]),
    );
  });

  it("requires a side for sinus lift and nerve procedures", async () => {
    const patient = await admin.post("/api/patients").send({
      fileNumber: "8803",
      fullName: "مريض تحقق الإجراءات المساندة",
    });
    const freshCase = await admin
      .post(`/api/patients/${patient.body.patient.id}/implant-cases`)
      .send({});

    const sinus = await admin
      .post(`/api/implant-cases/${freshCase.body.case.id}/bone-graft-procedures`)
      .send({
        ...procedurePayload,
        procedureCategory: "رفع الجيب الفكي",
        procedureType: "رفع مغلق",
        liftType: "مغلق",
      });
    expect(sinus.status).toBe(400);

    const nerve = await admin
      .post(`/api/implant-cases/${freshCase.body.case.id}/bone-graft-procedures`)
      .send({
        ...procedurePayload,
        procedureCategory: "إبعاد / نقل العصب السنخي السفلي",
        procedureType: "نقل العصب",
      });
    expect(nerve.status).toBe(400);
  });
});