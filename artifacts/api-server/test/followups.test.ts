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
let doctor: TestAgent;

let patientId: string;
let caseId: string;
/** Second patient (archived mid-suite to test write blocking). */
let archivedPatientId: string;
let archivedCaseId: string;
let archivedFollowupId: string;
/** Communication created for patient B before it was archived. */
let archivedPatientCommunicationId: string;
/** Archived case belonging to the ACTIVE patient (case-level guard). */
let archivedOwnCaseId: string;

/** Riyadh calendar date (YYYY-MM-DD) shifted by whole days from now. */
function riyadhDay(offsetDays: number): string {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Riyadh" }).format(d);
}

async function seedUser(
  username: string,
  role: "DOCTOR" | "ASSISTANT",
): Promise<TestAgent> {
  await pool.query(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES ($1, $2, $3, $4)`,
    [username, bcrypt.hashSync("Fup0TestPass12", 10), `مستخدم ${username}`, role],
  );
  const agent = agentFor(app);
  await login(agent, username, "Fup0TestPass12");
  return agent;
}

async function createFollowup(
  agent: TestAgent,
  body: Record<string, unknown> = {},
  targetCaseId = caseId,
) {
  return agent.post(`/api/implant-cases/${targetCaseId}/followups`).send({
    followupType: "متابعة بعد العملية",
    scheduledAt: `${riyadhDay(1)}T10:00`,
    ...body,
  });
}

beforeAll(async () => {
  admin = await freshAdminSession(app, pool);
  assistant = await seedUser("fup-assistant", "ASSISTANT");
  doctor = await seedUser("fup-doctor", "DOCTOR");

  const p = await admin.post("/api/patients").send({
    fileNumber: "9101",
    fullName: "مريض متابعة الاختبار",
    mobileNumber: "0501234567",
  });
  patientId = p.body.patient.id;
  const c = await admin.post(`/api/patients/${patientId}/implant-cases`).send({});
  caseId = c.body.case.id;

  const p2 = await admin.post("/api/patients").send({
    fileNumber: "9102",
    fullName: "مريض مؤرشف للمتابعة",
  });
  archivedPatientId = p2.body.patient.id;
  const c2 = await admin
    .post(`/api/patients/${archivedPatientId}/implant-cases`)
    .send({});
  archivedCaseId = c2.body.case.id;
  const f = await createFollowup(admin, {}, archivedCaseId);
  archivedFollowupId = f.body.followup.id;
  const comm = await admin
    .post(`/api/patients/${archivedPatientId}/communications`)
    .send({ communicationReason: "تواصل عام", renderedMessage: "رسالة قبل الأرشفة" });
  archivedPatientCommunicationId = comm.body.communication.id;
  await admin.post(`/api/patients/${archivedPatientId}/archive`).send({});

  const c3 = await admin.post(`/api/patients/${patientId}/implant-cases`).send({});
  archivedOwnCaseId = c3.body.case.id;
  await admin.post(`/api/implant-cases/${archivedOwnCaseId}/archive`).send({});
});

afterAll(async () => {
  await pool.end();
});

describe("whatsapp templates", () => {
  it("returns the six approved templates in order, with placeholders", async () => {
    const res = await assistant.get("/api/whatsapp-templates");
    expect(res.status).toBe(200);
    const templates = res.body.templates;
    expect(templates).toHaveLength(6);
    const orders = templates.map((t: { sortOrder: number }) => t.sortOrder);
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
    for (const t of templates) {
      expect(t.body).toContain("{{patientName}}");
    }
    expect(templates[0].name).toBe("تذكير بالموعد");
    expect(templates[0].body).toContain("{{date}}");
    expect(templates[0].body).toContain("{{time}}");
  });

  it("never claims a message was sent, delivered, or read", async () => {
    const res = await admin.get("/api/whatsapp-templates");
    for (const t of res.body.templates) {
      expect(t.body).not.toMatch(/تم الإرسال|تم التسليم|تمت القراءة/);
    }
  });

  it("requires authentication", async () => {
    const res = await agentFor(app).get("/api/whatsapp-templates");
    expect(res.status).toBe(401);
  });
});

describe("follow-up lifecycle", () => {
  it("assistant can create a follow-up; patient is derived from the case", async () => {
    const res = await createFollowup(assistant, {
      note: "فحص ما بعد العملية",
    });
    expect(res.status).toBe(201);
    expect(res.body.followup.followupStatus).toBe("مجدولة");
    expect(res.body.followup.patientId).toBe(patientId);
    expect(res.body.followup.note).toBe("فحص ما بعد العملية");
    const audit = await pool.query(
      `SELECT count(*) FROM audit_logs WHERE action = 'followup_created' AND entity_id = $1`,
      [res.body.followup.id],
    );
    expect(Number(audit.rows[0].count)).toBe(1);
  });

  it("rejects an invalid follow-up type", async () => {
    const res = await createFollowup(admin, { followupType: "نوع غير موجود" });
    expect(res.status).toBe(400);
  });

  it("doctor can edit an open follow-up", async () => {
    const created = await createFollowup(admin);
    const res = await doctor
      .patch(`/api/followups/${created.body.followup.id}`)
      .send({ followupType: "أشعة", note: "تعديل الطبيب" });
    expect(res.status).toBe(200);
    expect(res.body.followup.followupType).toBe("أشعة");
    expect(res.body.followup.note).toBe("تعديل الطبيب");
  });

  it("completing stores the result and closes the record", async () => {
    const created = await createFollowup(admin);
    const id = created.body.followup.id;
    const res = await assistant
      .post(`/api/followups/${id}/outcome`)
      .send({ status: "تمت", result: "الزرعة مستقرة" });
    expect(res.status).toBe(200);
    expect(res.body.followup.followupStatus).toBe("تمت");
    expect(res.body.followup.result).toBe("الزرعة مستقرة");

    const edit = await admin.patch(`/api/followups/${id}`).send({ note: "x" });
    expect(edit.status).toBe(409);
    expect(edit.body.code).toBe("FOLLOWUP_CLOSED");
    const again = await admin
      .post(`/api/followups/${id}/outcome`)
      .send({ status: "ملغاة" });
    expect(again.status).toBe(409);
  });

  it("records no-show and no-response outcomes", async () => {
    for (const status of ["لم يحضر", "لا يوجد رد", "تحتاج إعادة تواصل"]) {
      const created = await createFollowup(admin);
      const res = await doctor
        .post(`/api/followups/${created.body.followup.id}/outcome`)
        .send({ status });
      expect(res.status).toBe(200);
      expect(res.body.followup.followupStatus).toBe(status);
    }
  });

  it("postponing preserves history and creates a new scheduled record", async () => {
    const created = await createFollowup(admin);
    const id = created.body.followup.id;
    const newDate = `${riyadhDay(7)}T09:30`;
    const res = await assistant
      .post(`/api/followups/${id}/postpone`)
      .send({ newScheduledAt: newDate });
    expect(res.status).toBe(200);
    expect(res.body.followup.id).toBe(id);
    expect(res.body.followup.followupStatus).toBe("مؤجلة");
    expect(res.body.newFollowup.followupStatus).toBe("مجدولة");
    expect(res.body.newFollowup.followupType).toBe(
      res.body.followup.followupType,
    );
    expect(res.body.newFollowup.id).not.toBe(id);

    const audit = await pool.query(
      `SELECT details FROM audit_logs WHERE action = 'followup_postponed' AND entity_id = $1`,
      [id],
    );
    expect(audit.rows).toHaveLength(1);
    expect(audit.rows[0].details.newFollowupId).toBe(res.body.newFollowup.id);

    const again = await admin
      .post(`/api/followups/${id}/postpone`)
      .send({ newScheduledAt: `${riyadhDay(9)}T09:30` });
    expect(again.status).toBe(409);
  });

  it("cancelling closes the record", async () => {
    const created = await createFollowup(admin);
    const res = await admin
      .post(`/api/followups/${created.body.followup.id}/outcome`)
      .send({ status: "ملغاة" });
    expect(res.status).toBe(200);
    expect(res.body.followup.followupStatus).toBe("ملغاة");
  });

  it("lists the patient's follow-up timeline", async () => {
    const res = await doctor.get(`/api/patients/${patientId}/followups`);
    expect(res.status).toBe(200);
    expect(res.body.followups.length).toBeGreaterThan(5);
    for (const f of res.body.followups) {
      expect(f.patientId).toBe(patientId);
    }
  });
});

describe("notifications", () => {
  let todayId: string;
  let overdueId: string;
  let futureId: string;
  let contactId: string;

  it("classifies today's, overdue, and contact-task follow-ups", async () => {
    todayId = (await createFollowup(admin, { scheduledAt: `${riyadhDay(0)}T12:00` }))
      .body.followup.id;
    overdueId = (
      await createFollowup(admin, { scheduledAt: `${riyadhDay(-1)}T23:59` })
    ).body.followup.id;
    futureId = (
      await createFollowup(admin, { scheduledAt: `${riyadhDay(5)}T08:00` })
    ).body.followup.id;
    contactId = (
      await createFollowup(admin, {
        scheduledAt: `${riyadhDay(10)}T08:00`,
        requiresContact: true,
        contactDueAt: riyadhDay(-1),
      })
    ).body.followup.id;

    const res = await assistant.get("/api/notifications");
    expect(res.status).toBe(200);
    const byId = (id: string, kind: string) =>
      res.body.items.find(
        (i: { followupId: string | null; kind: string }) =>
          i.followupId === id && i.kind === kind,
      );
    expect(byId(todayId, "due_today")).toBeTruthy();
    expect(byId(overdueId, "overdue")).toBeTruthy();
    expect(byId(contactId, "contact_due")).toBeTruthy();
    expect(
      res.body.items.find((i: { followupId: string | null }) => i.followupId === futureId),
    ).toBeFalsy();
  });

  it("completed follow-ups drop out of overdue immediately", async () => {
    await admin
      .post(`/api/followups/${overdueId}/outcome`)
      .send({ status: "تمت" });
    const res = await admin.get("/api/notifications");
    expect(
      res.body.items.find((i: { followupId: string | null }) => i.followupId === overdueId),
    ).toBeFalsy();
  });

  it("surfaces ready-for-treatment cases", async () => {
    await admin
      .patch(`/api/implant-cases/${caseId}`)
      .send({ caseStatus: "جاهز للتركيب" });
    const res = await doctor.get("/api/notifications");
    const item = res.body.items.find(
      (i: { kind: string; implantCaseId: string | null }) =>
        i.kind === "ready_case" && i.implantCaseId === caseId,
    );
    expect(item).toBeTruthy();
    expect(item.reason).toBe("حالة جاهزة للتركيب");
  });

  it("requires authentication", async () => {
    const res = await agentFor(app).get("/api/notifications");
    expect(res.status).toBe(401);
  });
});

describe("archived patient write blocking", () => {
  it("blocks creating a follow-up on an archived patient's case", async () => {
    const res = await createFollowup(admin, {}, archivedCaseId);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PATIENT_ARCHIVED");
    expect(res.body.error).toContain("مؤرشف");
  });

  it("blocks outcome, postpone, and edits on the archived patient", async () => {
    const outcome = await admin
      .post(`/api/followups/${archivedFollowupId}/outcome`)
      .send({ status: "تمت" });
    expect(outcome.status).toBe(409);
    const postpone = await admin
      .post(`/api/followups/${archivedFollowupId}/postpone`)
      .send({ newScheduledAt: `${riyadhDay(3)}T10:00` });
    expect(postpone.status).toBe(409);
    const edit = await admin
      .patch(`/api/followups/${archivedFollowupId}`)
      .send({ note: "x" });
    expect(edit.status).toBe(409);
  });

  it("blocks logging communications for an archived patient", async () => {
    const res = await admin
      .post(`/api/patients/${archivedPatientId}/communications`)
      .send({
        communicationReason: "تواصل عام",
        renderedMessage: "رسالة",
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PATIENT_ARCHIVED");
  });

  it("blocks recording a result on an archived patient's communication", async () => {
    const res = await admin
      .patch(`/api/communications/${archivedPatientCommunicationId}/result`)
      .send({ communicationResult: "تم التواصل" });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("PATIENT_ARCHIVED");
  });

  it("blocks linking a communication to an archived case", async () => {
    const res = await admin
      .post(`/api/patients/${patientId}/communications`)
      .send({
        implantCaseId: archivedOwnCaseId,
        communicationReason: "تواصل عام",
        renderedMessage: "رسالة",
      });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe("CASE_ARCHIVED");
  });

  it("excludes archived patients from notifications", async () => {
    const res = await admin.get("/api/notifications");
    expect(
      res.body.items.find(
        (i: { patientId: string }) => i.patientId === archivedPatientId,
      ),
    ).toBeFalsy();
  });
});

describe("communications", () => {
  let communicationId: string;

  it("logs an opened WhatsApp link without claiming delivery", async () => {
    const res = await assistant
      .post(`/api/patients/${patientId}/communications`)
      .send({
        implantCaseId: caseId,
        communicationReason: "تذكير بالموعد",
        renderedMessage: "أهلًا مريض متابعة الاختبار،\nنذكركم بموعدكم.",
      });
    expect(res.status).toBe(201);
    communicationId = res.body.communication.id;
    expect(res.body.communication.openedAt).toBeTruthy();
    expect(res.body.communication.communicationResult).toBe("تم فتح واتساب");
    const audit = await pool.query(
      `SELECT count(*) FROM audit_logs WHERE action = 'whatsapp_opened' AND entity_id = $1`,
      [communicationId],
    );
    expect(Number(audit.rows[0].count)).toBe(1);
  });

  it("rejects a communication linked to another patient's case", async () => {
    const res = await admin
      .post(`/api/patients/${patientId}/communications`)
      .send({
        implantCaseId: archivedCaseId,
        communicationReason: "تواصل عام",
        renderedMessage: "رسالة",
      });
    expect(res.status).toBe(400);
  });

  it("records every allowed communication result", async () => {
    for (const result of [
      "تم فتح واتساب",
      "تم التواصل",
      "لا يوجد رد",
      "أكد الموعد",
      "طلب تغيير الموعد",
      "سيتم التواصل لاحقًا",
      "رقم غير صحيح",
    ]) {
      const res = await doctor
        .patch(`/api/communications/${communicationId}/result`)
        .send({ communicationResult: result });
      expect(res.status).toBe(200);
      expect(res.body.communication.communicationResult).toBe(result);
    }
    const audit = await pool.query(
      `SELECT count(*) FROM audit_logs WHERE action = 'communication_result' AND entity_id = $1`,
      [communicationId],
    );
    expect(Number(audit.rows[0].count)).toBe(7);
  });

  it("rejects an unknown result", async () => {
    const res = await admin
      .patch(`/api/communications/${communicationId}/result`)
      .send({ communicationResult: "نتيجة غير معروفة" });
    expect(res.status).toBe(400);
  });

  it("returns the communication timeline, newest first", async () => {
    const res = await assistant.get(`/api/patients/${patientId}/communications`);
    expect(res.status).toBe(200);
    expect(res.body.communications.length).toBeGreaterThan(0);
    const dates = res.body.communications.map((c: { createdAt: string }) =>
      new Date(c.createdAt).getTime(),
    );
    expect(dates).toEqual([...dates].sort((a, b) => b - a));
  });

  it("exposes assignable users to every role", async () => {
    const res = await assistant.get("/api/users/assignable");
    expect(res.status).toBe(200);
    expect(res.body.users.length).toBeGreaterThanOrEqual(3);
    expect(res.body.users[0]).toHaveProperty("fullName");
  });
});
