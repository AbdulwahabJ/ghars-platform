import { Router, type IRouter } from "express";
import { and, asc, desc, eq, inArray, isNull, ne, notInArray } from "drizzle-orm";
import {
  db,
  implantCasesTable,
  implantsTable,
  implantSystemOptionsTable,
  lookupOptionsTable,
  patientsTable,
  prostheticEventsTable,
  type ImplantCaseRow,
  type ImplantRow,
  type ProstheticEventRow,
} from "@workspace/db";
import {
  CASE_ARCHIVED,
  CASE_NOT_FOUND,
  DUPLICATE_SITE,
  IMPLANT_ARCHIVED,
  IMPLANT_NOT_FOUND,
  LOOKUP_CATEGORIES,
  PATIENT_ARCHIVED,
  REIMPLANTABLE_STATUSES,
  SOURCE_CASE_INVALID,
  implantCaseInputSchema,
  implantCaseUpdateSchema,
  implantInputSchema,
  implantUpdateSchema,
  prostheticEventInputSchema,
  PROSTHETIC_EVENT_NOT_FOUND,
  riyadhDateOf,
  type Implant,
  type ImplantCase,
  type ImplantOptionsResponse,
  type ProstheticEvent,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/patients/:patientId/implant-cases", requireAuth);
router.use("/implant-cases", requireAuth);
router.use("/implants", requireAuth);
router.use("/implant-options", requireAuth);
router.use("/prosthetic-events", requireAuth);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_NOT_FOUND_BODY = {
  error: "حالة الزراعة غير موجودة.",
  code: CASE_NOT_FOUND,
};
const IMPLANT_NOT_FOUND_BODY = {
  error: "الزرعة غير موجودة.",
  code: IMPLANT_NOT_FOUND,
};
const PROSTHETIC_EVENT_NOT_FOUND_BODY = {
  error: "سجل التركيب غير موجود.",
  code: PROSTHETIC_EVENT_NOT_FOUND,
};
const CASE_ARCHIVED_BODY = {
  error: "حالة الزراعة مؤرشفة. قم باستعادتها أولًا قبل التعديل.",
  code: CASE_ARCHIVED,
};
const PATIENT_ARCHIVED_BODY = {
  error: "ملف المريض مؤرشف ولا يمكن تعديل بياناته. قم باستعادة الملف أولًا.",
  code: PATIENT_ARCHIVED,
};
const DUPLICATE_SITE_BODY = {
  error:
    "يوجد بالفعل زرعة نشطة على هذا السن في نفس الحالة. لتسجيل إعادة زراعة، حدّث حالة الزرعة الحالية إلى فاشلة أو تحتاج إعادة أو قم بأرشفتها.",
  code: DUPLICATE_SITE,
};

/** PostgreSQL unique-constraint violation (walks Drizzle's cause chain). */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "23505") return true;
    current = candidate.cause;
  }
  return false;
}

function toCaseDto(row: ImplantCaseRow): ImplantCase {
  return {
    id: row.id,
    patientId: row.patientId,
    procedureDate: row.procedureDate,
    treatingDoctor: row.treatingDoctor,
    referringDoctor: row.referringDoctor,
    caseStatus: row.caseStatus as ImplantCase["caseStatus"],
    prosValue: row.prosValue,
    expectedProstheticDate: row.expectedProstheticDate,
    generalNote: row.generalNote,
    legacyCostNote: row.legacyCostNote,
    isReimplantation: row.isReimplantation,
    reimplantationReason: row.reimplantationReason,
    sourceCaseId: row.sourceCaseId,
    status: row.archivedAt ? "archived" : "active",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toImplantDto(row: ImplantRow): Implant {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    site: row.site,
    isCustomSite: row.isCustomSite,
    system: row.system,
    diameter: row.diameter == null ? null : Number(row.diameter),
    length: row.length == null ? null : Number(row.length),
    qValue: row.qValue,
    formerValue: row.formerValue,
    graftValue: row.graftValue,
    graftProcedureType: row.graftProcedureType,
    graftNote: row.graftNote,
    procedureTags: row.procedureTags ?? [],
    implantStatus: row.implantStatus as Implant["implantStatus"],
    implantNote: row.implantNote,
    status: row.archivedAt ? "archived" : "active",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function toProstheticEventDto(row: ProstheticEventRow): ProstheticEvent {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    implantId: row.implantId,
    eventType: row.eventType as ProstheticEvent["eventType"],
    eventDate: row.eventDate,
    note: row.note,
    status: row.archivedAt ? "archived" : "active",
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
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

async function findImplant(id: string): Promise<ImplantRow | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(implantsTable)
    .where(eq(implantsTable.id, id))
    .limit(1);
  return row;
}

async function findProstheticEvent(
  id: string,
): Promise<ProstheticEventRow | undefined> {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(prostheticEventsTable)
    .where(eq(prostheticEventsTable.id, id))
    .limit(1);
  return row;
}

/**
 * A source case must exist, belong to the same patient, and not be the case
 * itself. Returns an Arabic error string when invalid, otherwise null.
 */
async function validateSourceCase(
  sourceCaseId: string,
  patientId: string,
  selfId?: string,
): Promise<string | null> {
  if (selfId && sourceCaseId === selfId) {
    return "لا يمكن ربط الحالة بنفسها كحالة مصدر.";
  }
  const source = await findCase(sourceCaseId);
  if (!source || source.patientId !== patientId) {
    return "الحالة المصدر غير موجودة أو لا تخص نفس المريض.";
  }
  return null;
}

/** True when the parent patient file is archived (all writes are blocked). */
async function isPatientArchived(patientId: string): Promise<boolean> {
  const [row] = await db
    .select({ archivedAt: patientsTable.archivedAt })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId))
    .limit(1);
  return Boolean(row?.archivedAt);
}

/** True when an active implant already occupies this site in the case. */
async function hasActiveSiteConflict(
  caseId: string,
  site: string,
  excludeImplantId?: string,
): Promise<boolean> {
  const conditions = [
    eq(implantsTable.implantCaseId, caseId),
    eq(implantsTable.site, site),
    isNull(implantsTable.archivedAt),
    notInArray(implantsTable.implantStatus, [...REIMPLANTABLE_STATUSES]),
  ];
  if (excludeImplantId) {
    conditions.push(ne(implantsTable.id, excludeImplantId));
  }
  const [row] = await db
    .select({ id: implantsTable.id })
    .from(implantsTable)
    .where(and(...conditions))
    .limit(1);
  return Boolean(row);
}

/* ------------------------------------------------------------------ */
/* Options                                                             */
/* ------------------------------------------------------------------ */

router.get("/implant-options", async (_req, res) => {
  const [systems, lookups] = await Promise.all([
    db
      .select({ name: implantSystemOptionsTable.name })
      .from(implantSystemOptionsTable)
      .where(eq(implantSystemOptionsTable.isActive, true))
      .orderBy(
        asc(implantSystemOptionsTable.sortOrder),
        asc(implantSystemOptionsTable.name),
      ),
    db
      .select({
        category: lookupOptionsTable.category,
        value: lookupOptionsTable.value,
      })
      .from(lookupOptionsTable)
      .where(
        and(
          eq(lookupOptionsTable.isActive, true),
          inArray(lookupOptionsTable.category, [
            LOOKUP_CATEGORIES.qValue,
            LOOKUP_CATEGORIES.formerValue,
            LOOKUP_CATEGORIES.graftValue,
            LOOKUP_CATEGORIES.procedureTag,
          ]),
        ),
      )
      .orderBy(asc(lookupOptionsTable.sortOrder), asc(lookupOptionsTable.value)),
  ]);

  const byCategory = (category: string) =>
    lookups.filter((l) => l.category === category).map((l) => l.value);

  const body: ImplantOptionsResponse = {
    systems: systems.map((s) => s.name),
    qValues: byCategory(LOOKUP_CATEGORIES.qValue),
    formerValues: byCategory(LOOKUP_CATEGORIES.formerValue),
    graftValues: byCategory(LOOKUP_CATEGORIES.graftValue),
    procedureTags: byCategory(LOOKUP_CATEGORIES.procedureTag),
  };
  res.json(body);
});

/* ------------------------------------------------------------------ */
/* Cases                                                               */
/* ------------------------------------------------------------------ */

router.get("/patients/:patientId/implant-cases", async (req, res) => {
  const { patientId } = req.params;
  if (!UUID_RE.test(patientId)) {
    res.status(404).json({ error: "المريض غير موجود.", code: "PATIENT_NOT_FOUND" });
    return;
  }
  const [patient] = await db
    .select({ id: patientsTable.id })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId))
    .limit(1);
  if (!patient) {
    res.status(404).json({ error: "المريض غير موجود.", code: "PATIENT_NOT_FOUND" });
    return;
  }

  const cases = await db
    .select()
    .from(implantCasesTable)
    .where(eq(implantCasesTable.patientId, patientId))
    .orderBy(desc(implantCasesTable.createdAt));

  const caseIds = cases.map((c) => c.id);
  const implants = caseIds.length
    ? await db
        .select()
        .from(implantsTable)
        .where(inArray(implantsTable.implantCaseId, caseIds))
        .orderBy(asc(implantsTable.createdAt))
    : [];
  const prostheticEvents = caseIds.length
    ? await db
        .select()
        .from(prostheticEventsTable)
        .where(inArray(prostheticEventsTable.implantCaseId, caseIds))
        .orderBy(
          desc(prostheticEventsTable.eventDate),
          desc(prostheticEventsTable.createdAt),
        )
    : [];

  const items = cases.map((c) => ({
    ...toCaseDto(c),
    implants: implants
      .filter((i) => i.implantCaseId === c.id)
      .map(toImplantDto),
    prostheticEvents: prostheticEvents
      .filter((event) => event.implantCaseId === c.id)
      .map(toProstheticEventDto),
  }));
  res.json({ items });
});

router.post("/patients/:patientId/implant-cases", async (req, res) => {
  const { patientId } = req.params;
  if (!UUID_RE.test(patientId)) {
    res.status(404).json({ error: "المريض غير موجود.", code: "PATIENT_NOT_FOUND" });
    return;
  }
  const [patient] = await db
    .select({ id: patientsTable.id, archivedAt: patientsTable.archivedAt })
    .from(patientsTable)
    .where(eq(patientsTable.id, patientId))
    .limit(1);
  if (!patient) {
    res.status(404).json({ error: "المريض غير موجود.", code: "PATIENT_NOT_FOUND" });
    return;
  }
  if (patient.archivedAt) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }

  const input = parseOrRespond(implantCaseInputSchema, req.body, res);
  if (!input) return;

  if (!input.isReimplantation) {
    input.reimplantationReason = null;
    input.sourceCaseId = null;
  }
  if (input.sourceCaseId) {
    const problem = await validateSourceCase(input.sourceCaseId, patientId);
    if (problem) {
      res.status(400).json({ error: problem, code: SOURCE_CASE_INVALID });
      return;
    }
  }

  const [row] = await db
    .insert(implantCasesTable)
    .values({
      patientId,
      procedureDate: input.procedureDate,
      treatingDoctor: input.treatingDoctor,
      referringDoctor: input.referringDoctor,
      caseStatus: input.caseStatus,
      prosValue: input.prosValue,
      expectedProstheticDate: input.expectedProstheticDate,
      generalNote: input.generalNote,
      legacyCostNote: input.legacyCostNote,
      isReimplantation: input.isReimplantation,
      reimplantationReason: input.reimplantationReason,
      sourceCaseId: input.sourceCaseId,
      createdBy: req.currentUser!.id,
      updatedBy: req.currentUser!.id,
    })
    .returning();

  await writeAudit({
    userId: req.currentUser!.id,
    action: "implant_case_create",
    entityType: "implant_case",
    entityId: row.id,
    summary: `إنشاء حالة زراعة جديدة (${row.caseStatus})`,
  });
  res.status(201).json({ case: toCaseDto(row) });
});

router.post("/implant-cases/:id/prosthetic-events", async (req, res) => {
  const parentCase = await findCase(String(req.params.id));
  if (!parentCase) {
    res.status(404).json(CASE_NOT_FOUND_BODY);
    return;
  }
  if (parentCase.archivedAt) {
    res.status(409).json(CASE_ARCHIVED_BODY);
    return;
  }
  if (await isPatientArchived(parentCase.patientId)) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }

  const input = parseOrRespond(prostheticEventInputSchema, req.body, res);
  if (!input) return;

  if (input.eventDate > riyadhDateOf(new Date())) {
    res.status(400).json({
      error: "لا يمكن توثيق تركيب بتاريخ مستقبلي.",
      code: "PROSTHETIC_EVENT_DATE_FUTURE",
    });
    return;
  }

  if (input.implantId) {
    const implant = await findImplant(input.implantId);
    if (
      !implant ||
      implant.implantCaseId !== parentCase.id ||
      implant.archivedAt
    ) {
      res.status(400).json({
        error: "الزرعة المحددة غير موجودة في هذه الحالة أو مؤرشفة.",
        code: "PROSTHETIC_EVENT_IMPLANT_INVALID",
      });
      return;
    }
  }

  const [row] = await db
    .insert(prostheticEventsTable)
    .values({
      implantCaseId: parentCase.id,
      implantId: input.implantId,
      eventType: input.eventType,
      eventDate: input.eventDate,
      note: input.note,
      createdBy: req.currentUser!.id,
    })
    .returning();

  await writeAudit({
    userId: req.currentUser!.id,
    action: "prosthetic_event_create",
    entityType: "prosthetic_event",
    entityId: row.id,
    summary: `توثيق ${row.eventType}`,
  });
  res.status(201).json({ event: toProstheticEventDto(row) });
});

router.patch("/implant-cases/:id", async (req, res) => {
  const existing = await findCase(String(req.params.id));
  if (!existing) {
    res.status(404).json(CASE_NOT_FOUND_BODY);
    return;
  }
  if (existing.archivedAt) {
    res.status(409).json(CASE_ARCHIVED_BODY);
    return;
  }
  if (await isPatientArchived(existing.patientId)) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }

  const updates = parseOrRespond(implantCaseUpdateSchema, req.body, res);
  if (!updates) return;

  const merged = {
    isReimplantation: updates.isReimplantation ?? existing.isReimplantation,
    reimplantationReason:
      updates.reimplantationReason !== undefined
        ? updates.reimplantationReason
        : existing.reimplantationReason,
    sourceCaseId:
      updates.sourceCaseId !== undefined
        ? updates.sourceCaseId
        : existing.sourceCaseId,
  };
  if (!merged.isReimplantation) {
    merged.reimplantationReason = null;
    merged.sourceCaseId = null;
  }
  if (merged.sourceCaseId && merged.sourceCaseId !== existing.sourceCaseId) {
    const problem = await validateSourceCase(
      merged.sourceCaseId,
      existing.patientId,
      existing.id,
    );
    if (problem) {
      res.status(400).json({ error: problem, code: SOURCE_CASE_INVALID });
      return;
    }
  }

  const changedFields = Object.keys(updates);
  const [row] = await db
    .update(implantCasesTable)
    .set({
      ...(updates.procedureDate !== undefined && {
        procedureDate: updates.procedureDate,
      }),
      ...(updates.treatingDoctor !== undefined && {
        treatingDoctor: updates.treatingDoctor,
      }),
      ...(updates.referringDoctor !== undefined && {
        referringDoctor: updates.referringDoctor,
      }),
      ...(updates.caseStatus !== undefined && {
        caseStatus: updates.caseStatus,
      }),
      ...(updates.prosValue !== undefined && { prosValue: updates.prosValue }),
      ...(updates.expectedProstheticDate !== undefined && {
        expectedProstheticDate: updates.expectedProstheticDate,
      }),
      ...(updates.generalNote !== undefined && {
        generalNote: updates.generalNote,
      }),
      ...(updates.legacyCostNote !== undefined && {
        legacyCostNote: updates.legacyCostNote,
      }),
      isReimplantation: merged.isReimplantation,
      reimplantationReason: merged.reimplantationReason,
      sourceCaseId: merged.sourceCaseId,
      updatedBy: req.currentUser!.id,
      updatedAt: new Date(),
    })
    .where(eq(implantCasesTable.id, existing.id))
    .returning();

  await writeAudit({
    userId: req.currentUser!.id,
    action: "implant_case_update",
    entityType: "implant_case",
    entityId: existing.id,
    summary: "تعديل بيانات حالة زراعة",
    details: { changedFields },
  });
  res.json({ case: toCaseDto(row) });
});

router.post(
  "/implant-cases/:id/archive",
  requireRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const existing = await findCase(String(req.params.id));
    if (!existing) {
      res.status(404).json(CASE_NOT_FOUND_BODY);
      return;
    }
    if (existing.archivedAt) {
      res.json({ case: toCaseDto(existing) });
      return;
    }
    if (await isPatientArchived(existing.patientId)) {
      res.status(409).json(PATIENT_ARCHIVED_BODY);
      return;
    }
    const [row] = await db
      .update(implantCasesTable)
      .set({
        archivedAt: new Date(),
        updatedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(
        and(eq(implantCasesTable.id, existing.id), isNull(implantCasesTable.archivedAt)),
      )
      .returning();
    if (!row) {
      res.status(404).json(CASE_NOT_FOUND_BODY);
      return;
    }
    await writeAudit({
      userId: req.currentUser!.id,
      action: "implant_case_archive",
      entityType: "implant_case",
      entityId: existing.id,
      summary: "أرشفة حالة زراعة",
    });
    res.json({ case: toCaseDto(row) });
  },
);

router.post(
  "/implant-cases/:id/restore",
  requireRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const existing = await findCase(String(req.params.id));
    if (!existing) {
      res.status(404).json(CASE_NOT_FOUND_BODY);
      return;
    }
    if (!existing.archivedAt) {
      res.json({ case: toCaseDto(existing) });
      return;
    }
    if (await isPatientArchived(existing.patientId)) {
      res.status(409).json(PATIENT_ARCHIVED_BODY);
      return;
    }
    const [row] = await db
      .update(implantCasesTable)
      .set({
        archivedAt: null,
        updatedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(implantCasesTable.id, existing.id))
      .returning();
    await writeAudit({
      userId: req.currentUser!.id,
      action: "implant_case_restore",
      entityType: "implant_case",
      entityId: existing.id,
      summary: "استعادة حالة زراعة من الأرشيف",
    });
    res.json({ case: toCaseDto(row) });
  },
);

router.post(
  "/prosthetic-events/:id/archive",
  requireRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const existing = await findProstheticEvent(String(req.params.id));
    if (!existing) {
      res.status(404).json(PROSTHETIC_EVENT_NOT_FOUND_BODY);
      return;
    }
    if (existing.archivedAt) {
      res.json({ event: toProstheticEventDto(existing) });
      return;
    }

    const parentCase = await findCase(existing.implantCaseId);
    if (!parentCase) {
      res.status(404).json(CASE_NOT_FOUND_BODY);
      return;
    }
    if (parentCase.archivedAt) {
      res.status(409).json(CASE_ARCHIVED_BODY);
      return;
    }
    if (await isPatientArchived(parentCase.patientId)) {
      res.status(409).json(PATIENT_ARCHIVED_BODY);
      return;
    }

    const [row] = await db
      .update(prostheticEventsTable)
      .set({ archivedAt: new Date() })
      .where(
        and(
          eq(prostheticEventsTable.id, existing.id),
          isNull(prostheticEventsTable.archivedAt),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json(PROSTHETIC_EVENT_NOT_FOUND_BODY);
      return;
    }

    await writeAudit({
      userId: req.currentUser!.id,
      action: "prosthetic_event_archive",
      entityType: "prosthetic_event",
      entityId: row.id,
      summary: "أرشفة سجل تركيب",
    });
    res.json({ event: toProstheticEventDto(row) });
  },
);

/* ------------------------------------------------------------------ */
/* Implants                                                            */
/* ------------------------------------------------------------------ */

router.post("/implant-cases/:id/implants", async (req, res) => {
  const parentCase = await findCase(String(req.params.id));
  if (!parentCase) {
    res.status(404).json(CASE_NOT_FOUND_BODY);
    return;
  }
  if (parentCase.archivedAt) {
    res.status(409).json(CASE_ARCHIVED_BODY);
    return;
  }
  if (await isPatientArchived(parentCase.patientId)) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }

  const input = parseOrRespond(implantInputSchema, req.body, res);
  if (!input) return;

  if (await hasActiveSiteConflict(parentCase.id, input.site)) {
    res.status(409).json(DUPLICATE_SITE_BODY);
    return;
  }

  try {
    const [row] = await db
      .insert(implantsTable)
      .values({
        implantCaseId: parentCase.id,
        site: input.site,
        isCustomSite: false,
        system: input.system,
        diameter: input.diameter == null ? null : String(input.diameter),
        length: input.length == null ? null : String(input.length),
        qValue: input.qValue,
        formerValue: input.formerValue,
        graftValue: input.graftValue,
        graftProcedureType: input.graftProcedureType,
        graftNote: input.graftNote,
        procedureTags: input.procedureTags,
        implantStatus: input.implantStatus,
        implantNote: input.implantNote,
        createdBy: req.currentUser!.id,
        updatedBy: req.currentUser!.id,
      })
      .returning();

    await writeAudit({
      userId: req.currentUser!.id,
      action: "implant_create",
      entityType: "implant",
      entityId: row.id,
      summary: `إضافة زرعة على السن ${row.site}`,
    });
    res.status(201).json({ implant: toImplantDto(row) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json(DUPLICATE_SITE_BODY);
      return;
    }
    throw err;
  }
});

router.patch("/implants/:id", async (req, res) => {
  const existing = await findImplant(String(req.params.id));
  if (!existing) {
    res.status(404).json(IMPLANT_NOT_FOUND_BODY);
    return;
  }
  if (existing.archivedAt) {
    res.status(409).json({
      error: "الزرعة مؤرشفة ولا يمكن تعديلها.",
      code: IMPLANT_ARCHIVED,
    });
    return;
  }
  const parentCase = await findCase(existing.implantCaseId);
  if (parentCase?.archivedAt) {
    res.status(409).json(CASE_ARCHIVED_BODY);
    return;
  }
  if (parentCase && (await isPatientArchived(parentCase.patientId))) {
    res.status(409).json(PATIENT_ARCHIVED_BODY);
    return;
  }

  const updates = parseOrRespond(implantUpdateSchema, req.body, res);
  if (!updates) return;

  const targetSite = updates.site ?? existing.site;
  const targetStatus = updates.implantStatus ?? existing.implantStatus;
  const becomesActive = !(
    REIMPLANTABLE_STATUSES as readonly string[]
  ).includes(targetStatus);
  if (
    becomesActive &&
    (targetSite !== existing.site ||
      (REIMPLANTABLE_STATUSES as readonly string[]).includes(
        existing.implantStatus,
      )) &&
    (await hasActiveSiteConflict(existing.implantCaseId, targetSite, existing.id))
  ) {
    res.status(409).json(DUPLICATE_SITE_BODY);
    return;
  }

  const changedFields = Object.keys(updates);
  try {
    const [row] = await db
      .update(implantsTable)
      .set({
        ...(updates.site !== undefined && { site: updates.site }),
        ...(updates.system !== undefined && { system: updates.system }),
        ...(updates.diameter !== undefined && {
          diameter: updates.diameter == null ? null : String(updates.diameter),
        }),
        ...(updates.length !== undefined && {
          length: updates.length == null ? null : String(updates.length),
        }),
        ...(updates.qValue !== undefined && { qValue: updates.qValue }),
        ...(updates.formerValue !== undefined && {
          formerValue: updates.formerValue,
        }),
        ...(updates.graftValue !== undefined && {
          graftValue: updates.graftValue,
        }),
        ...(updates.graftProcedureType !== undefined && {
          graftProcedureType: updates.graftProcedureType,
        }),
        ...(updates.graftNote !== undefined && { graftNote: updates.graftNote }),
        ...(updates.procedureTags !== undefined && {
          procedureTags: updates.procedureTags,
        }),
        ...(updates.implantStatus !== undefined && {
          implantStatus: updates.implantStatus,
        }),
        ...(updates.implantNote !== undefined && {
          implantNote: updates.implantNote,
        }),
        updatedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(eq(implantsTable.id, existing.id))
      .returning();

    await writeAudit({
      userId: req.currentUser!.id,
      action: "implant_update",
      entityType: "implant",
      entityId: existing.id,
      summary: `تعديل زرعة السن ${row.site}`,
      details: { changedFields },
    });
    res.json({ implant: toImplantDto(row) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json(DUPLICATE_SITE_BODY);
      return;
    }
    throw err;
  }
});

router.post(
  "/implants/:id/archive",
  requireRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const existing = await findImplant(String(req.params.id));
    if (!existing) {
      res.status(404).json(IMPLANT_NOT_FOUND_BODY);
      return;
    }
    if (existing.archivedAt) {
      res.json({ implant: toImplantDto(existing) });
      return;
    }
    const parentCase = await findCase(existing.implantCaseId);
    if (parentCase && (await isPatientArchived(parentCase.patientId))) {
      res.status(409).json(PATIENT_ARCHIVED_BODY);
      return;
    }
    const [row] = await db
      .update(implantsTable)
      .set({
        archivedAt: new Date(),
        implantStatus: "مؤرشفة",
        updatedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(and(eq(implantsTable.id, existing.id), isNull(implantsTable.archivedAt)))
      .returning();
    if (!row) {
      res.status(404).json(IMPLANT_NOT_FOUND_BODY);
      return;
    }
    await writeAudit({
      userId: req.currentUser!.id,
      action: "implant_archive",
      entityType: "implant",
      entityId: existing.id,
      summary: `أرشفة زرعة السن ${existing.site}`,
    });
    res.json({ implant: toImplantDto(row) });
  },
);

export default router;
