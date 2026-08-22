import { Router, type IRouter } from "express";
import type { Response } from "express";
import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import {
  communicationsTable,
  db,
  followupsTable,
  implantCasesTable,
  patientsTable,
  usersTable,
  whatsappTemplatesTable,
  type CommunicationRow,
  type FollowupRow,
  type ImplantCaseRow,
} from "@workspace/db";
import {
  CLOSED_FOLLOWUP_STATUSES,
  OPEN_FOLLOWUP_STATUS,
  READY_CASE_STATUS,
  communicationInputSchema,
  communicationResultInputSchema,
  followupInputSchema,
  followupOutcomeSchema,
  followupPostponeSchema,
  followupUpdateSchema,
  riyadhDateOf,
  type Communication,
  type Followup,
  type NotificationItem,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/patients", requireAuth);
router.use("/implant-cases", requireAuth);
router.use("/followups", requireAuth);
router.use("/communications", requireAuth);
router.use("/whatsapp-templates", requireAuth);
router.use("/notifications", requireAuth);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_NOT_FOUND_BODY = {
  error: "حالة الزراعة غير موجودة.",
  code: "CASE_NOT_FOUND",
};
const CASE_ARCHIVED_BODY = {
  error: "حالة الزراعة مؤرشفة. قم باستعادتها أولًا قبل التعديل.",
  code: "CASE_ARCHIVED",
};
const PATIENT_ARCHIVED_BODY = {
  error: "ملف المريض مؤرشف ولا يمكن تعديل بياناته. قم باستعادة الملف أولًا.",
  code: "PATIENT_ARCHIVED",
};
const PATIENT_NOT_FOUND_BODY = {
  error: "ملف المريض غير موجود.",
  code: "PATIENT_NOT_FOUND",
};
const FOLLOWUP_NOT_FOUND_BODY = {
  error: "سجل المتابعة غير موجود.",
  code: "FOLLOWUP_NOT_FOUND",
};
const FOLLOWUP_CLOSED_BODY = {
  error: "سجل المتابعة مغلق ولا يمكن تعديله. أنشئ متابعة جديدة بدلًا من ذلك.",
  code: "FOLLOWUP_CLOSED",
};

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

async function findPatient(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(patientsTable)
    .where(eq(patientsTable.id, id))
    .limit(1);
  return row;
}

async function findCase(id: string): Promise<ImplantCaseRow | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(implantCasesTable)
    .where(eq(implantCasesTable.id, id))
    .limit(1);
  return row;
}

async function isPatientArchived(patientId: string): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: patientsTable.archivedAt })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId))
    .limit(1);
  return Boolean(row?.archivedAt);
}

/** Blocks Phase 4 writes on archived cases or archived patient files. */
async function guardWritableCase(
  caseId: string,
  res: Response,
): Promise<ImplantCaseRow | undefined> {
  const row = await findCase(caseId);
  if (!row) {
    res.status(404).json(CASE_NOT_FOUND_BODY);
    return undefined;
  }
  if (row.archivedAt) {
    res.status(409).json(CASE_ARCHIVED_BODY);
    return undefined;
  }
  if (await isPatientArchived(row.patientId)) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return undefined;
  }
  return row;
}

async function findFollowup(id: string): Promise<FollowupRow | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(followupsTable)
    .where(eq(followupsTable.id, id))
    .limit(1);
  return row;
}

async function userNames(
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({ id: usersTable.id, fullName: usersTable.fullName })
    .from(usersTable)
    .where(inArray(usersTable.id, unique));
  return new Map(rows.map((r) => [r.id, r.fullName]));
}

const iso = (v: Date | null): string | null => (v ? v.toISOString() : null);

function toFollowupDto(
  row: FollowupRow,
  names: Map<string, string>,
): Followup {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    patientId: row.patientId,
    followupType: row.followupType,
    followupStatus: row.followupStatus,
    scheduledAt: iso(row.scheduledAt),
    result: row.result,
    note: row.note,
    requiresContact: row.requiresContact,
    contactDueAt: iso(row.contactDueAt),
    nextAppointmentAt: iso(row.nextAppointmentAt),
    assignedUserId: row.assignedUserId,
    assignedUserName: row.assignedUserId
      ? (names.get(row.assignedUserId) ?? null)
      : null,
    createdByName: row.createdBy ? (names.get(row.createdBy) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

const CLOSED = CLOSED_FOLLOWUP_STATUSES as readonly string[];

/* ------------------------------------------------------------------ */
/* Assignable users (id + name only, for the assigned-user selector)    */
/* ------------------------------------------------------------------ */

router.get("/users/assignable", requireAuth, async (_req, res) => {
  const rows = await db
    .select({
      id: usersTable.id,
      fullName: usersTable.fullName,
      role: usersTable.role,
    })
    .from(usersTable)
    .where(eq(usersTable.isActive, true))
    .orderBy(asc(usersTable.fullName));
  res.json({ users: rows });
});

/* ------------------------------------------------------------------ */
/* WhatsApp templates (read-only in Phase 4; management is Phase 6)     */
/* ------------------------------------------------------------------ */

router.get("/whatsapp-templates", async (_req, res) => {
  const rows = await db
    .select()
    .from(whatsappTemplatesTable)
    .where(eq(whatsappTemplatesTable.isApproved, true))
    .orderBy(asc(whatsappTemplatesTable.sortOrder));
  res.json({
    templates: rows.map((r) => ({
      id: r.id,
      name: r.name,
      body: r.body,
      sortOrder: r.sortOrder,
    })),
  });
});

/* ------------------------------------------------------------------ */
/* Follow-ups                                                          */
/* ------------------------------------------------------------------ */

router.get("/patients/:id/followups", async (req, res) => {
  const patient = await findPatient(req.params.id);
  if (!patient) {
    res.status(404).json(PATIENT_NOT_FOUND_BODY);
    return;
  }
  const rows = await db
    .select()
    .from(followupsTable)
    .where(eq(followupsTable.patientId, patient.id))
    .orderBy(desc(followupsTable.scheduledAt), desc(followupsTable.createdAt));
  const names = await userNames(
    rows.flatMap((r) => [r.assignedUserId, r.createdBy]),
  );
  res.json({ followups: rows.map((r) => toFollowupDto(r, names)) });
});

router.post("/implant-cases/:id/followups", async (req, res) => {
  const caseRow = await guardWritableCase(req.params.id, res);
  if (!caseRow) return;
  const input = parseOrRespond(followupInputSchema, req.body, res);
  if (!input) return;
  const userId = req.currentUser!.id;

  const [created] = await db
    .insert(followupsTable)
    .values({
      implantCaseId: caseRow.id,
      patientId: caseRow.patientId,
      followupType: input.followupType,
      followupStatus: OPEN_FOLLOWUP_STATUS,
      scheduledAt: new Date(input.scheduledAt),
      requiresContact: input.requiresContact,
      contactDueAt: input.contactDueAt ? new Date(input.contactDueAt) : null,
      nextAppointmentAt: input.nextAppointmentAt
        ? new Date(input.nextAppointmentAt)
        : null,
      note: input.note,
      // Follow-ups created from the app always belong to the authenticated user.
      // Do not trust a client-supplied assignee id.
      assignedUserId: userId,
      createdBy: userId,
    })
    .returning();

  await writeAudit({
    userId,
    action: "followup_created",
    entityType: "followup",
    entityId: created.id,
    summary: `إنشاء متابعة (${input.followupType})`,
    details: { patientId: caseRow.patientId, implantCaseId: caseRow.id },
  });

  const names = await userNames([created.assignedUserId, created.createdBy]);
  res.status(201).json({ followup: toFollowupDto(created, names) });
});

router.patch("/followups/:id", async (req, res) => {
  const row = await findFollowup(req.params.id);
  if (!row) {
    res.status(404).json(FOLLOWUP_NOT_FOUND_BODY);
    return;
  }
  if (CLOSED.includes(row.followupStatus)) {
    res.status(409).json(FOLLOWUP_CLOSED_BODY);
    return;
  }
  if (!(await guardWritableCase(row.implantCaseId, res))) return;
  const input = parseOrRespond(followupUpdateSchema, req.body, res);
  if (!input) return;
  const userId = req.currentUser!.id;

  const [updated] = await db
    .update(followupsTable)
    .set({
      ...(input.followupType !== undefined
        ? { followupType: input.followupType }
        : {}),
      ...(input.scheduledAt !== undefined
        ? { scheduledAt: new Date(input.scheduledAt) }
        : {}),
      ...(input.requiresContact !== undefined
        ? { requiresContact: input.requiresContact }
        : {}),
      ...(input.contactDueAt !== undefined
        ? { contactDueAt: input.contactDueAt ? new Date(input.contactDueAt) : null }
        : {}),
      ...(input.nextAppointmentAt !== undefined
        ? {
            nextAppointmentAt: input.nextAppointmentAt
              ? new Date(input.nextAppointmentAt)
              : null,
          }
        : {}),
      ...(input.note !== undefined ? { note: input.note } : {}),
      ...(input.assignedUserId !== undefined
        ? { assignedUserId: input.assignedUserId ?? null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(followupsTable.id, row.id))
    .returning();

  await writeAudit({
    userId,
    action: "followup_updated",
    entityType: "followup",
    entityId: row.id,
    summary: `تعديل متابعة (${updated.followupType})`,
    details: { patientId: row.patientId },
  });

  const names = await userNames([updated.assignedUserId, updated.createdBy]);
  res.json({ followup: toFollowupDto(updated, names) });
});

/** Record an outcome: completed, no-show, no-response, needs re-contact, cancel. */
router.post("/followups/:id/outcome", async (req, res) => {
  const row = await findFollowup(req.params.id);
  if (!row) {
    res.status(404).json(FOLLOWUP_NOT_FOUND_BODY);
    return;
  }
  if (CLOSED.includes(row.followupStatus)) {
    res.status(409).json(FOLLOWUP_CLOSED_BODY);
    return;
  }
  if (!(await guardWritableCase(row.implantCaseId, res))) return;
  const input = parseOrRespond(followupOutcomeSchema, req.body, res);
  if (!input) return;
  const userId = req.currentUser!.id;

  const [updated] = await db
    .update(followupsTable)
    .set({
      followupStatus: input.status,
      result: input.result ?? row.result,
      note: input.note ?? row.note,
      updatedAt: new Date(),
    })
    .where(eq(followupsTable.id, row.id))
    .returning();

  const action =
    input.status === "تمت"
      ? "followup_completed"
      : input.status === "ملغاة"
        ? "followup_cancelled"
        : "followup_updated";
  await writeAudit({
    userId,
    action,
    entityType: "followup",
    entityId: row.id,
    summary: `تسجيل نتيجة متابعة: ${input.status}`,
    details: { patientId: row.patientId },
  });

  const names = await userNames([updated.assignedUserId, updated.createdBy]);
  res.json({ followup: toFollowupDto(updated, names) });
});

/**
 * Postpone: closes this record with "مؤجلة" (history preserved) and creates
 * a fresh scheduled follow-up on the new date, atomically.
 */
router.post("/followups/:id/postpone", async (req, res) => {
  const row = await findFollowup(req.params.id);
  if (!row) {
    res.status(404).json(FOLLOWUP_NOT_FOUND_BODY);
    return;
  }
  if (CLOSED.includes(row.followupStatus)) {
    res.status(409).json(FOLLOWUP_CLOSED_BODY);
    return;
  }
  if (!(await guardWritableCase(row.implantCaseId, res))) return;
  const input = parseOrRespond(followupPostponeSchema, req.body, res);
  if (!input) return;
  const userId = req.currentUser!.id;

  const { closed, created } = await db.transaction(async (tx) => {
    const [closedRow] = await tx
      .update(followupsTable)
      .set({ followupStatus: "مؤجلة", updatedAt: new Date() })
      .where(eq(followupsTable.id, row.id))
      .returning();
    const [createdRow] = await tx
      .insert(followupsTable)
      .values({
        implantCaseId: row.implantCaseId,
        patientId: row.patientId,
        followupType: row.followupType,
        followupStatus: OPEN_FOLLOWUP_STATUS,
        scheduledAt: new Date(input.newScheduledAt),
        requiresContact: row.requiresContact,
        contactDueAt: row.contactDueAt,
        nextAppointmentAt: null,
        note: input.note ?? row.note,
        assignedUserId: row.assignedUserId,
        createdBy: userId,
      })
      .returning();
    await writeAudit(
      {
        userId,
        action: "followup_postponed",
        entityType: "followup",
        entityId: row.id,
        summary: "تأجيل متابعة وتحديد موعد جديد",
        details: {
          patientId: row.patientId,
          previousScheduledAt: iso(row.scheduledAt),
          newScheduledAt: input.newScheduledAt,
          newFollowupId: createdRow.id,
        },
      },
      tx,
    );
    return { closed: closedRow, created: createdRow };
  });

  const names = await userNames([
    closed.assignedUserId,
    closed.createdBy,
    created.createdBy,
  ]);
  res.json({
    followup: toFollowupDto(closed, names),
    newFollowup: toFollowupDto(created, names),
  });
});

/* ------------------------------------------------------------------ */
/* Communications                                                      */
/* ------------------------------------------------------------------ */

function toCommunicationDto(
  row: CommunicationRow,
  names: Map<string, string>,
  templateNames: Map<string, string>,
): Communication {
  return {
    id: row.id,
    patientId: row.patientId,
    implantCaseId: row.implantCaseId,
    templateId: row.templateId,
    templateName: row.templateId
      ? (templateNames.get(row.templateId) ?? null)
      : null,
    communicationReason: row.communicationReason,
    renderedMessage: row.renderedMessage,
    openedAt: iso(row.openedAt),
    communicationResult: row.communicationResult,
    resultNote: row.resultNote,
    userName: row.userId ? (names.get(row.userId) ?? null) : null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function templateNamesFor(
  ids: Array<string | null>,
): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((v): v is string => Boolean(v)))];
  if (!unique.length) return new Map();
  const rows = await db
    .select({
      id: whatsappTemplatesTable.id,
      name: whatsappTemplatesTable.name,
    })
    .from(whatsappTemplatesTable)
    .where(inArray(whatsappTemplatesTable.id, unique));
  return new Map(rows.map((r) => [r.id, r.name]));
}

router.get("/patients/:id/communications", async (req, res) => {
  const patient = await findPatient(req.params.id);
  if (!patient) {
    res.status(404).json(PATIENT_NOT_FOUND_BODY);
    return;
  }
  const rows = await db
    .select()
    .from(communicationsTable)
    .where(eq(communicationsTable.patientId, patient.id))
    .orderBy(desc(communicationsTable.createdAt));
  const [names, templates] = await Promise.all([
    userNames(rows.map((r) => r.userId)),
    templateNamesFor(rows.map((r) => r.templateId)),
  ]);
  res.json({
    communications: rows.map((r) => toCommunicationDto(r, names, templates)),
  });
});

/** Log that a WhatsApp link was opened (the app never claims delivery/read). */
router.post("/patients/:id/communications", async (req, res) => {
  const patient = await findPatient(req.params.id);
  if (!patient) {
    res.status(404).json(PATIENT_NOT_FOUND_BODY);
    return;
  }
  if (patient.archivedAt) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }
  const input = parseOrRespond(communicationInputSchema, req.body, res);
  if (!input) return;
  if (input.implantCaseId) {
    const caseRow = await findCase(input.implantCaseId);
    if (!caseRow || caseRow.patientId !== patient.id) {
      res.status(400).json({
        error: "حالة الزراعة لا تتبع هذا المريض.",
        code: "CASE_NOT_FOUND",
      });
      return;
    }
    if (caseRow.archivedAt) {
      res.status(409).json(CASE_ARCHIVED_BODY);
      return;
    }
  }
  const userId = req.currentUser!.id;

  const [created] = await db
    .insert(communicationsTable)
    .values({
      patientId: patient.id,
      implantCaseId: input.implantCaseId,
      templateId: input.templateId,
      communicationReason: input.communicationReason,
      renderedMessage: input.renderedMessage,
      openedAt: new Date(),
      communicationResult: "تم فتح واتساب",
      userId,
    })
    .returning();

  await writeAudit({
    userId,
    action: "whatsapp_opened",
    entityType: "communication",
    entityId: created.id,
    summary: `فتح رابط واتساب (${input.communicationReason})`,
    details: { patientId: patient.id },
  });

  const [names, templates] = await Promise.all([
    userNames([userId]),
    templateNamesFor([created.templateId]),
  ]);
  res
    .status(201)
    .json({ communication: toCommunicationDto(created, names, templates) });
});

router.patch("/communications/:id/result", async (req, res) => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(404).json({
      error: "سجل التواصل غير موجود.",
      code: "COMMUNICATION_NOT_FOUND",
    });
    return;
  }
  const [row] = await db
    .select()
    .from(communicationsTable)
    .where(eq(communicationsTable.id, req.params.id))
    .limit(1);
  if (!row) {
    res.status(404).json({
      error: "سجل التواصل غير موجود.",
      code: "COMMUNICATION_NOT_FOUND",
    });
    return;
  }
  if (await isPatientArchived(row.patientId)) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }
  const input = parseOrRespond(communicationResultInputSchema, req.body, res);
  if (!input) return;
  const userId = req.currentUser!.id;

  const [updated] = await db
    .update(communicationsTable)
    .set({
      communicationResult: input.communicationResult,
      resultNote: input.resultNote,
    })
    .where(eq(communicationsTable.id, row.id))
    .returning();

  await writeAudit({
    userId,
    action: "communication_result",
    entityType: "communication",
    entityId: row.id,
    summary: `تسجيل نتيجة تواصل: ${input.communicationResult}`,
    details: { patientId: row.patientId },
  });

  const [names, templates] = await Promise.all([
    userNames([updated.userId]),
    templateNamesFor([updated.templateId]),
  ]);
  res.json({ communication: toCommunicationDto(updated, names, templates) });
});

/* ------------------------------------------------------------------ */
/* Notifications — live query, no table, no workers                    */
/* ------------------------------------------------------------------ */

router.get("/notifications", async (req, res) => {
  const now = new Date();
  const today = riyadhDateOf(now);
  const startOfToday = new Date(`${today}T00:00:00+03:00`);
  const endOfToday = new Date(`${today}T23:59:59.999+03:00`);

  const openFollowups = await db
    .select({
      f: followupsTable,
      patientName: patientsTable.fullName,
      patientArchivedAt: patientsTable.archivedAt,
      caseArchivedAt: implantCasesTable.archivedAt,
    })
    .from(followupsTable)
    .innerJoin(patientsTable, eq(followupsTable.patientId, patientsTable.id))
    .innerJoin(
      implantCasesTable,
      eq(followupsTable.implantCaseId, implantCasesTable.id),
    )
    .where(
      and(
        isNull(patientsTable.archivedAt),
        isNull(implantCasesTable.archivedAt),
        sql`${followupsTable.followupStatus} NOT IN ('تمت','ملغاة','مؤجلة')`,
      ),
    )
    .orderBy(asc(followupsTable.scheduledAt));

  const items: NotificationItem[] = [];

  for (const row of openFollowups) {
    const f = row.f;
    if (
      f.followupStatus === OPEN_FOLLOWUP_STATUS &&
      f.scheduledAt &&
      f.scheduledAt <= endOfToday
    ) {
      const overdue = f.scheduledAt < startOfToday;
      items.push({
        kind: overdue ? "overdue" : "due_today",
        patientId: f.patientId,
        patientName: row.patientName,
        reason: overdue
          ? `متابعة متأخرة: ${f.followupType}`
          : `موعد اليوم: ${f.followupType}`,
        dueAt: f.scheduledAt.toISOString(),
        followupId: f.id,
        implantCaseId: f.implantCaseId,
      });
    }
    if (f.requiresContact && f.contactDueAt && f.contactDueAt <= endOfToday) {
      items.push({
        kind: "contact_due",
        patientId: f.patientId,
        patientName: row.patientName,
        reason: `مهمة تواصل: ${f.followupType}`,
        dueAt: f.contactDueAt.toISOString(),
        followupId: f.id,
        implantCaseId: f.implantCaseId,
      });
    }
  }

  const readyCases = await db
    .select({
      caseId: implantCasesTable.id,
      patientId: implantCasesTable.patientId,
      patientName: patientsTable.fullName,
    })
    .from(implantCasesTable)
    .innerJoin(
      patientsTable,
      eq(implantCasesTable.patientId, patientsTable.id),
    )
    .where(
      and(
        eq(implantCasesTable.caseStatus, READY_CASE_STATUS),
        isNull(implantCasesTable.archivedAt),
        isNull(patientsTable.archivedAt),
      ),
    );
  for (const c of readyCases) {
    items.push({
      kind: "ready_case",
      patientId: c.patientId,
      patientName: c.patientName,
      reason: "حالة جاهزة للتركيب",
      dueAt: null,
      followupId: null,
      implantCaseId: c.caseId,
    });
  }

  // Overdue first, then today's, then contact tasks, then ready cases.
  const order = { overdue: 0, due_today: 1, contact_due: 2, ready_case: 3 };
  items.sort((a, b) => order[a.kind] - order[b.kind]);

  res.json({ items: items.slice(0, 30), totalCount: items.length });
});

export default router;
