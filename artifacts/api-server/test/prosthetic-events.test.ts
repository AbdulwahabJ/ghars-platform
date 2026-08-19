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
let assistant: TestAgent;
let patientId: string;
let caseId: string;
let implantId: string;
let eventId: string;

function riyadhToday(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
  }).format(new Date());
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, 'ASSISTANT')`,
    ["event-assistant", bcrypt.hashSync("Assist0Pass12", 10), "مساعدة السجل"],
  );
  assistant = agentFor(app);
  await login(assistant, "event-assistant", "Assist0Pass12");

  const patient = await admin.post("/api/patients").send({
    fileNumber: "8801",
    fullName: "مريض سجل التركيبات",
  });
  patientId = patient.body.patient.id;
  const implantCase = await admin
    .post(`/api/patients/${patientId}/implant-cases`)
    .send({ procedureDate: riyadhToday() });
  caseId = implantCase.body.case.id;
  const implant = await admin
    .post(`/api/implant-cases/${caseId}/implants`)
    .send({ site: "26", system: "Neodent" });
  implantId = implant.body.implant.id;
});

afterAll(async () => {
  await pool.end();
});

describe("prosthetic events", () => {
  it("requires authentication", async () => {
    const res = await agentFor(app)
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({ eventType: "تركيب دائم", eventDate: riyadhToday() });
    expect(res.status).toBe(401);
  });

  it("creates a dated event and returns it in the parent case list", async () => {
    const res = await admin
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({
        eventType: "تركيب دائم",
        eventDate: riyadhToday(),
        implantId,
        note: "تركيب نهائي موثق",
      });
    expect(res.status).toBe(201);
    expect(res.body.event).toMatchObject({
      implantCaseId: caseId,
      implantId,
      eventType: "تركيب دائم",
      status: "active",
    });
    eventId = res.body.event.id;

    const list = await admin.get(`/api/patients/${patientId}/implant-cases`);
    expect(list.status).toBe(200);
    const row = list.body.items.find((item: { id: string }) => item.id === caseId);
    expect(row.prostheticEvents).toEqual([
      expect.objectContaining({ id: eventId, note: "تركيب نهائي موثق" }),
    ]);
    expect(row.implants.find((item: { id: string }) => item.id === implantId))
      .toMatchObject({ implantStatus: "تم التركيب" });
  });

  it("synchronizes a linked temporary event but leaves case-level events from guessing an implant", async () => {
    const temporary = await admin
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({
        eventType: "تركيب مؤقت",
        eventDate: riyadhToday(),
        implantId,
        note: "تركيب مؤقت موثق",
      });
    expect(temporary.status).toBe(201);
    expect(temporary.body.implant).toMatchObject({
      id: implantId,
      implantStatus: "تم تركيب مؤقت",
    });

    const caseLevel = await admin
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({
        eventType: "تركيب دائم",
        eventDate: riyadhToday(),
        note: "تركيب على مستوى الحالة",
      });
    expect(caseLevel.status).toBe(201);
    expect(caseLevel.body.implant).toBeUndefined();

    const list = await admin.get(`/api/patients/${patientId}/implant-cases`);
    const row = list.body.items.find((item: { id: string }) => item.id === caseId);
    expect(row.implants.find((item: { id: string }) => item.id === implantId))
      .toMatchObject({ implantStatus: "تم تركيب مؤقت" });
  });

  it("does not create an event when unrelated implant fields are edited", async () => {
    const before = await admin.get(`/api/patients/${patientId}/implant-cases`);
    const beforeRow = before.body.items.find((item: { id: string }) => item.id === caseId);
    const eventCount = beforeRow.prostheticEvents.length;

    const update = await admin.patch(`/api/implants/${implantId}`).send({
      qValue: "30",
    });
    expect(update.status).toBe(200);
    expect(update.body.implant).toMatchObject({
      id: implantId,
      qValue: "30",
      implantStatus: "تم تركيب مؤقت",
    });

    const after = await admin.get(`/api/patients/${patientId}/implant-cases`);
    const afterRow = after.body.items.find((item: { id: string }) => item.id === caseId);
    expect(afterRow.prostheticEvents).toHaveLength(eventCount);
  });

  it("rejects future dates and implants from another case", async () => {
    const impossibleDate = await admin
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({ eventType: "تركيب مؤقت", eventDate: "2026-02-30" });
    expect(impossibleDate.status).toBe(400);

    const future = await admin
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({ eventType: "تركيب مؤقت", eventDate: "2099-01-01" });
    expect(future.status).toBe(400);
    expect(future.body.code).toBe("PROSTHETIC_EVENT_DATE_FUTURE");

    const otherCase = await admin
      .post(`/api/patients/${patientId}/implant-cases`)
      .send({});
    const otherImplant = await admin
      .post(`/api/implant-cases/${otherCase.body.case.id}/implants`)
      .send({ site: "27" });
    const wrongImplant = await admin
      .post(`/api/implant-cases/${caseId}/prosthetic-events`)
      .send({
        eventType: "تركيب مؤقت",
        eventDate: riyadhToday(),
        implantId: otherImplant.body.implant.id,
      });
    expect(wrongImplant.status).toBe(400);
    expect(wrongImplant.body.code).toBe("PROSTHETIC_EVENT_IMPLANT_INVALID");
  });

  it("requires doctor or admin to archive and keeps archiving idempotent", async () => {
    const denied = await assistant.post(`/api/prosthetic-events/${eventId}/archive`);
    expect(denied.status).toBe(403);

    const archived = await admin.post(`/api/prosthetic-events/${eventId}/archive`);
    expect(archived.status).toBe(200);
    expect(archived.body.event.status).toBe("archived");

    const again = await admin.post(`/api/prosthetic-events/${eventId}/archive`);
    expect(again.status).toBe(200);
    expect(again.body.event.status).toBe("archived");

    const audit = await pool.query(
      `SELECT action FROM audit_logs
       WHERE entity_id = $1
       ORDER BY action`,
      [eventId],
    );
    expect(audit.rows.map((row) => row.action)).toEqual([
      "prosthetic_event_archive",
      "prosthetic_event_create",
    ]);
  });
});