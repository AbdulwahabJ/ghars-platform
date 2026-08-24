import { Router, type IRouter } from "express";
import { and, eq, isNull } from "drizzle-orm";
import {
  boneGraftProceduresTable,
  db,
  implantCasesTable,
  implantsTable,
  patientsTable,
  type BoneGraftProcedureRow,
} from "@workspace/db";
import {
  boneGraftProcedureInputSchema,
  boneGraftProcedureUpdateSchema,
  CASE_ARCHIVED,
  CASE_NOT_FOUND,
  PATIENT_ARCHIVED,
  type BoneGraftProcedure,
} from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();
router.use("/implant-cases/:caseId/bone-graft-procedures", requireAuth);
router.use("/bone-graft-procedures", requireAuth);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const CASE_NOT_FOUND_BODY = {
  error: "حالة الزراعة غير موجودة.",
  code: CASE_NOT_FOUND,
};
const PROCEDURE_NOT_FOUND_BODY = {
  error: "سجل الإجراء الجراحي غير موجود.",
  code: "BONE_GRAFT_PROCEDURE_NOT_FOUND",
};
const CASE_ARCHIVED_BODY = {
  error: "حالة الزراعة مؤرشفة. قم باستعادتها أولًا قبل التعديل.",
  code: CASE_ARCHIVED,
};
const PATIENT_ARCHIVED_BODY = {
  error: "ملف المريض مؤرشف ولا يمكن تعديل بياناته. قم باستعادة الملف أولًا.",
  code: PATIENT_ARCHIVED,
};

function toDto(row: BoneGraftProcedureRow): BoneGraftProcedure {
  return {
    id: row.id,
    implantCaseId: row.implantCaseId,
    implantId: row.implantId,
    procedureDate: row.procedureDate,
    procedureCategory: row.procedureCategory as BoneGraftProcedure["procedureCategory"],
    procedureType: row.procedureType,
    procedureSide: row.procedureSide as BoneGraftProcedure["procedureSide"],
    liftType: row.liftType,
    site: row.site,
    material: row.material,
    membrane: row.membrane,
    quantity: row.quantity,
    size: row.size,
    treatingDoctor: row.treatingDoctor,
    procedureStatus: row.procedureStatus,
    note: row.note,
    status: row.archivedAt ? "archived" : "active",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

async function findCase(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(implantCasesTable)
    .where(eq(implantCasesTable.id, id))
    .limit(1);
  return row;
}

async function findProcedure(id: string) {
  if (!UUID_RE.test(id)) return undefined;
  const [row] = await db
    .select()
    .from(boneGraftProceduresTable)
    .where(eq(boneGraftProceduresTable.id, id))
    .limit(1);
  return row;
}

async function ensureWritableCase(caseId: string) {
  const parentCase = await findCase(caseId);
  if (!parentCase) return { error: CASE_NOT_FOUND_BODY } as const;
  if (parentCase.archivedAt) return { error: CASE_ARCHIVED_BODY } as const;
  const [patient] = await db
    .select({ archivedAt: patientsTable.archivedAt })
    .from(patientsTable)
    .where(eq(patientsTable.id, parentCase.patientId))
    .limit(1);
  if (patient?.archivedAt) return { error: PATIENT_ARCHIVED_BODY } as const;
  return { parentCase } as const;
}

async function validLinkedImplant(
  implantId: string | null,
  implantCaseId: string,
): Promise<boolean> {
  if (!implantId) return true;
  const [implant] = await db
    .select({ id: implantsTable.id })
    .from(implantsTable)
    .where(
      and(
        eq(implantsTable.id, implantId),
        eq(implantsTable.implantCaseId, implantCaseId),
        isNull(implantsTable.archivedAt),
      ),
    )
    .limit(1);
  return Boolean(implant);
}

function invalidLinkedImplant(res: import("express").Response) {
  res.status(400).json({
    error: "الزرعة المحددة غير موجودة في هذه الحالة أو مؤرشفة.",
    code: "BONE_GRAFT_PROCEDURE_IMPLANT_INVALID",
  });
}

router.post("/implant-cases/:caseId/bone-graft-procedures", async (req, res) => {
  const writable = await ensureWritableCase(String(req.params.caseId));
  if ("error" in writable) {
    const error = writable.error!;
    res.status(error.code === CASE_NOT_FOUND ? 404 : 409).json(error);
    return;
  }
  const input = parseOrRespond(boneGraftProcedureInputSchema, req.body, res);
  if (!input) return;
  if (!(await validLinkedImplant(input.implantId, writable.parentCase.id))) {
    invalidLinkedImplant(res);
    return;
  }

  const [row] = await db
    .insert(boneGraftProceduresTable)
    .values({
      implantCaseId: writable.parentCase.id,
      ...input,
      createdBy: req.currentUser!.id,
      updatedBy: req.currentUser!.id,
    })
    .returning();
  await writeAudit({
    userId: req.currentUser!.id,
    action: "bone_graft_procedure_create",
    entityType: "bone_graft_procedure",
    entityId: row.id,
    summary: `توثيق إجراء جراحي مساند: ${row.procedureCategory}`,
  });
  res.status(201).json({ procedure: toDto(row) });
});

router.patch("/bone-graft-procedures/:id", async (req, res) => {
  const existing = await findProcedure(String(req.params.id));
  if (!existing) {
    res.status(404).json(PROCEDURE_NOT_FOUND_BODY);
    return;
  }
  if (existing.archivedAt) {
    res.status(409).json({
      error: "سجل الإجراء الجراحي مؤرشف ولا يمكن تعديله.",
      code: "BONE_GRAFT_PROCEDURE_ARCHIVED",
    });
    return;
  }
  const writable = await ensureWritableCase(existing.implantCaseId);
  if ("error" in writable) {
    const error = writable.error!;
    res.status(error.code === CASE_NOT_FOUND ? 404 : 409).json(error);
    return;
  }
  const updates = parseOrRespond(boneGraftProcedureUpdateSchema, req.body, res);
  if (!updates) return;
  const implantId = updates.implantId === undefined ? existing.implantId : updates.implantId;
  const mergedInput = boneGraftProcedureInputSchema.safeParse({
    ...existing,
    ...updates,
    implantId,
  });
  if (!mergedInput.success) {
    res.status(400).json({ error: mergedInput.error.issues[0]?.message ?? "بيانات الإجراء غير صحيحة." });
    return;
  }
  if (!(await validLinkedImplant(implantId, existing.implantCaseId))) {
    invalidLinkedImplant(res);
    return;
  }

  const [row] = await db
    .update(boneGraftProceduresTable)
    .set({ ...updates, updatedBy: req.currentUser!.id, updatedAt: new Date() })
    .where(eq(boneGraftProceduresTable.id, existing.id))
    .returning();
  await writeAudit({
    userId: req.currentUser!.id,
    action: "bone_graft_procedure_update",
    entityType: "bone_graft_procedure",
    entityId: row.id,
    summary: `تعديل إجراء جراحي مساند: ${row.procedureCategory}`,
    details: { changedFields: Object.keys(updates) },
  });
  res.json({ procedure: toDto(row) });
});

router.post(
  "/bone-graft-procedures/:id/archive",
  requireRole("ADMIN", "DOCTOR"),
  async (req, res) => {
    const existing = await findProcedure(String(req.params.id));
    if (!existing) {
      res.status(404).json(PROCEDURE_NOT_FOUND_BODY);
      return;
    }
    if (existing.archivedAt) {
      res.json({ procedure: toDto(existing) });
      return;
    }
    const writable = await ensureWritableCase(existing.implantCaseId);
    if ("error" in writable) {
      const error = writable.error!;
      res.status(error.code === CASE_NOT_FOUND ? 404 : 409).json(error);
      return;
    }
    const [row] = await db
      .update(boneGraftProceduresTable)
      .set({
        archivedAt: new Date(),
        updatedBy: req.currentUser!.id,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(boneGraftProceduresTable.id, existing.id),
          isNull(boneGraftProceduresTable.archivedAt),
        ),
      )
      .returning();
    if (!row) {
      res.status(404).json(PROCEDURE_NOT_FOUND_BODY);
      return;
    }
    await writeAudit({
      userId: req.currentUser!.id,
      action: "bone_graft_procedure_archive",
      entityType: "bone_graft_procedure",
      entityId: row.id,
      summary: `أرشفة إجراء جراحي مساند: ${row.procedureCategory}`,
    });
    res.json({ procedure: toDto(row) });
  },
);

export default router;