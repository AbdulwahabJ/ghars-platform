import { Router, type IRouter } from "express";
import { and, count, desc, eq, ilike, inArray, isNotNull, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { db, patientsTable, type PatientRow } from "@workspace/db";
import {
  DUPLICATE_ACTIVE,
  DUPLICATE_ARCHIVED,
  normalizeArabicSearchText,
  normalizeMobile,
  patientInputSchema,
  patientBulkActionSchema,
  patientListQuerySchema,
  patientUpdateSchema,
  toEnglishDigits,
  type Patient,
} from "@workspace/shared";
import { writeAudit, writeAuditRequired } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/patients", requireAuth);

const NOT_FOUND = { error: "المريض غير موجود.", code: "PATIENT_NOT_FOUND" };
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function toPatientDto(row: PatientRow): Patient {
  return {
    id: row.id,
    fileNumber: row.fileNumber,
    fullName: row.fullName,
    mobileNumber: row.mobileNumber,
    mobileNormalized: row.mobileNormalized,
    age: row.age,
    administrativeNote: row.administrativeNote,
    status: row.archivedAt ? "archived" : "active",
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * PostgreSQL unique-constraint violation (SQLSTATE 23505). Drizzle may wrap
 * the driver error (e.g. DrizzleQueryError), so walk the `cause` chain.
 */
function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  for (let depth = 0; depth < 5 && typeof current === "object" && current !== null; depth++) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (candidate.code === "23505") return true;
    current = candidate.cause;
  }
  return false;
}

function respondDuplicate(
  res: Parameters<typeof parseOrRespond>[2],
  conflict: PatientRow,
): void {
  res.status(409).json({
    error: conflict.archivedAt
      ? "رقم الملف يعود لمريض مؤرشف."
      : "هذا المريض مسجل مسبقًا.",
    code: conflict.archivedAt ? DUPLICATE_ARCHIVED : DUPLICATE_ACTIVE,
    patientId: conflict.id,
  });
}

/** File numbers are stored with Latin digits so Arabic-digit input matches. */
function canonicalFileNumber(value: string): string {
  return toEnglishDigits(value).trim();
}

async function findByFileNumber(
  fileNumber: string,
  tenantId: string,
): Promise<PatientRow | undefined> {
  const [row] = await db
    .select()
    .from(patientsTable)
    .where(and(eq(patientsTable.fileNumber, fileNumber), eq(patientsTable.tenantId, tenantId)))
    .limit(1);
  return row;
}

/**
 * Resolve mobile fields from input. Returns undefined after responding with
 * 400 when the number is invalid (explicit country code rules — never guess).
 */
function resolveMobile(
  mobileNumber: string | null | undefined,
  res: Parameters<typeof parseOrRespond>[2],
): { mobileNumber: string | null; mobileNormalized: string | null } | undefined {
  if (!mobileNumber) {
    return { mobileNumber: null, mobileNormalized: null };
  }
  const result = normalizeMobile(mobileNumber);
  if (!result.ok) {
    res.status(400).json({ error: result.message, code: "INVALID_MOBILE" });
    return undefined;
  }
  return { mobileNumber, mobileNormalized: result.normalized };
}

router.get("/patients", async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const query = parseOrRespond(patientListQuerySchema, req.query, res);
  if (!query) return;

  const conditions: SQL[] = [eq(patientsTable.tenantId, tenantId)];
  if (query.status === "active") {
    conditions.push(isNull(patientsTable.archivedAt));
  } else if (query.status === "archived") {
    conditions.push(isNotNull(patientsTable.archivedAt));
  }

  if (query.query) {
    const raw = toEnglishDigits(query.query).trim();
    const nameNorm = normalizeArabicSearchText(query.query);
    const digits = raw.replace(/\D/g, "");
    const searchConds: SQL[] = [];
    if (nameNorm) {
      searchConds.push(
        ilike(patientsTable.fullNameNormalized, `%${escapeLike(nameNorm)}%`),
      );
    }
    if (raw) {
      searchConds.push(
        ilike(patientsTable.fileNumber, `%${escapeLike(raw)}%`),
      );
    }
    if (digits.length >= 3) {
      searchConds.push(
        like(patientsTable.mobileNormalized, `%${digits}%`),
        like(patientsTable.mobileNumber, `%${digits}%`),
      );
    }
    const combined = or(...searchConds);
    if (combined) conditions.push(combined);
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [rows, [totalRow]] = await Promise.all([
    db
      .select()
      .from(patientsTable)
      .where(where)
      .orderBy(desc(patientsTable.createdAt))
      .limit(query.pageSize)
      .offset((query.page - 1) * query.pageSize),
    db.select({ value: count() }).from(patientsTable).where(where),
  ]);

  res.json({
    items: rows.map(toPatientDto),
    total: totalRow?.value ?? 0,
    page: query.page,
    pageSize: query.pageSize,
  });
});

router.get("/patients/check-file-number", async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const fileNumber = canonicalFileNumber(String(req.query.fileNumber ?? ""));
  if (!fileNumber) {
    res.status(400).json({ error: "رقم الملف مطلوب.", code: "VALIDATION_ERROR" });
    return;
  }
  const existing = await findByFileNumber(fileNumber, tenantId);
  if (!existing) {
    res.json({ status: "available" });
    return;
  }
  res.json({
    status: existing.archivedAt ? "archived" : "active",
    patientId: existing.id,
    fullName: existing.fullName,
  });
});

router.post("/patients", async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const input = parseOrRespond(patientInputSchema, req.body, res);
  if (!input) return;

  const fileNumber = canonicalFileNumber(input.fileNumber);
  const mobile = resolveMobile(input.mobileNumber, res);
  if (!mobile) return;

  const existing = await findByFileNumber(fileNumber, tenantId);
  if (existing) {
    respondDuplicate(res, existing);
    return;
  }

  const user = req.currentUser!;
  let created: PatientRow | undefined;
  try {
    [created] = await db
      .insert(patientsTable)
      .values({
        tenantId,
        fileNumber,
        fullName: input.fullName,
        fullNameNormalized: normalizeArabicSearchText(input.fullName),
        mobileNumber: mobile.mobileNumber,
        mobileNormalized: mobile.mobileNormalized,
        age: input.age,
        administrativeNote: input.administrativeNote,
        createdBy: user.id,
        updatedBy: user.id,
      })
      .returning();
  } catch (err) {
    // Concurrent create with the same file number: the pre-check above
    // cannot close this race; the unique constraint is the source of truth.
    if (isUniqueViolation(err)) {
      const conflict = await findByFileNumber(fileNumber, tenantId);
      if (conflict) {
        respondDuplicate(res, conflict);
        return;
      }
    }
    throw err;
  }
  if (!created) {
    res.status(500).json({ error: "تعذر إنشاء ملف المريض.", code: "INTERNAL" });
    return;
  }

  await writeAudit({
    tenantId,
    userId: user.id,
    action: "patient_create",
    entityType: "patient",
    entityId: created.id,
    summary: `إنشاء ملف مريض برقم ${created.fileNumber}`,
  });

  res.status(201).json({ patient: toPatientDto(created) });
});

router.get("/patients/:id", async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const [row] = await db
    .select()
    .from(patientsTable)
    .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId)))
    .limit(1);
  if (!row) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  res.json({ patient: toPatientDto(row) });
});

router.patch("/patients/:id", async (req, res) => {
  const tenantId = req.currentTenant!.id;
  const id = String(req.params.id);
  if (!UUID_RE.test(id)) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const input = parseOrRespond(patientUpdateSchema, req.body, res);
  if (!input) return;

  const [existing] = await db
    .select()
    .from(patientsTable)
    .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId)))
    .limit(1);
  if (!existing) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  const updates: Partial<typeof patientsTable.$inferInsert> = {};
  const changedFields: string[] = [];

  if (input.fileNumber !== undefined) {
    const fileNumber = canonicalFileNumber(input.fileNumber);
    if (fileNumber !== existing.fileNumber) {
      const [conflict] = await db
        .select()
        .from(patientsTable)
        .where(
          and(eq(patientsTable.fileNumber, fileNumber), ne(patientsTable.id, id), eq(patientsTable.tenantId, tenantId)),
        )
        .limit(1);
      if (conflict) {
        respondDuplicate(res, conflict);
        return;
      }
      updates.fileNumber = fileNumber;
      changedFields.push("file_number");
    }
  }

  if (input.fullName !== undefined && input.fullName !== existing.fullName) {
    updates.fullName = input.fullName;
    updates.fullNameNormalized = normalizeArabicSearchText(input.fullName);
    changedFields.push("full_name");
  }

  if (input.mobileNumber !== undefined) {
    const mobile = resolveMobile(input.mobileNumber, res);
    if (!mobile) return;
    if (mobile.mobileNumber !== existing.mobileNumber) {
      updates.mobileNumber = mobile.mobileNumber;
      updates.mobileNormalized = mobile.mobileNormalized;
      changedFields.push("mobile_number");
    }
  }

  if (input.age !== undefined && input.age !== existing.age) {
    updates.age = input.age;
    changedFields.push("age");
  }

  if (
    input.administrativeNote !== undefined &&
    input.administrativeNote !== existing.administrativeNote
  ) {
    updates.administrativeNote = input.administrativeNote;
    changedFields.push("administrative_note");
  }

  if (changedFields.length === 0) {
    res.json({ patient: toPatientDto(existing) });
    return;
  }

  const user = req.currentUser!;
  updates.updatedBy = user.id;
  updates.updatedAt = new Date();

  let updated: PatientRow | undefined;
  try {
    [updated] = await db
      .update(patientsTable)
      .set(updates)
      .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId)))
      .returning();
  } catch (err) {
    if (isUniqueViolation(err) && updates.fileNumber) {
      const conflict = await findByFileNumber(updates.fileNumber, tenantId);
      if (conflict && conflict.id !== id) {
        respondDuplicate(res, conflict);
        return;
      }
    }
    throw err;
  }
  if (!updated) {
    res.status(500).json({ error: "تعذر حفظ التعديلات.", code: "INTERNAL" });
    return;
  }

  await writeAudit({
    tenantId,
    userId: user.id,
    action: "patient_update",
    entityType: "patient",
    entityId: updated.id,
    summary: `تعديل ملف المريض ${updated.fileNumber}`,
    details: { changedFields },
  });

  res.json({ patient: toPatientDto(updated) });
});

router.post(
  "/patients/:id/archive",
  requireRole("ADMIN"),
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const user = req.currentUser!;
    const [updated] = await db
      .update(patientsTable)
      .set({ archivedAt: new Date(), updatedBy: user.id, updatedAt: new Date() })
      .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId), isNull(patientsTable.archivedAt)))
      .returning();
    if (!updated) {
      const [row] = await db
        .select()
        .from(patientsTable)
        .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId)))
        .limit(1);
      if (!row) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      res.json({ patient: toPatientDto(row) });
      return;
    }
    await writeAudit({
      tenantId,
      userId: user.id,
      action: "patient_archive",
      entityType: "patient",
      entityId: updated.id,
      summary: `أرشفة ملف المريض ${updated.fileNumber}`,
    });
    res.json({ patient: toPatientDto(updated) });
  },
);

router.post(
  "/patients/:id/restore",
  requireRole("ADMIN"),
  async (req, res) => {
    const tenantId = req.currentTenant!.id;
    const id = String(req.params.id);
    if (!UUID_RE.test(id)) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const user = req.currentUser!;
    const [updated] = await db
      .update(patientsTable)
      .set({ archivedAt: null, updatedBy: user.id, updatedAt: new Date() })
      .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId), isNotNull(patientsTable.archivedAt)))
      .returning();
    if (!updated) {
      const [row] = await db
        .select()
        .from(patientsTable)
        .where(and(eq(patientsTable.id, id), eq(patientsTable.tenantId, tenantId)))
        .limit(1);
      if (!row) {
        res.status(404).json(NOT_FOUND);
        return;
      }
      res.json({ patient: toPatientDto(row) });
      return;
    }
    await writeAudit({
      tenantId,
      userId: user.id,
      action: "patient_restore",
      entityType: "patient",
      entityId: updated.id,
      summary: `استعادة ملف المريض ${updated.fileNumber}`,
    });
    res.json({ patient: toPatientDto(updated) });
  },
);

router.post(
  "/patients/bulk-action",
  requireRole("ADMIN"),
  async (req, res) => {
    const input = parseOrRespond(patientBulkActionSchema, req.body, res);
    if (!input) return;
    const tenantId = req.currentTenant!.id;
    const user = req.currentUser!;
    const patientIds = [...new Set(input.patientIds)];
    const patients = await db.select().from(patientsTable).where(and(
      eq(patientsTable.tenantId, tenantId),
      inArray(patientsTable.id, patientIds),
    ));
    if (patients.length !== patientIds.length) {
      res.status(422).json({ error: "تعذر تنفيذ العملية لأن سجلًا واحدًا على الأقل غير صالح.", code: "BULK_INVALID_SELECTION" });
      return;
    }
    const wrongState = patients.some((patient) =>
      input.action === "archive" ? patient.archivedAt !== null : patient.archivedAt === null,
    );
    if (wrongState) {
      res.status(409).json({ error: "حالة سجل واحد على الأقل لا تطابق العملية المطلوبة.", code: "BULK_STATE_CONFLICT" });
      return;
    }
    const idSql = sql.join(patientIds.map((id) => sql`${id}::uuid`), sql`, `);
    const impactRows = await db.execute(sql`
      SELECT
        ${patientIds.length}::int AS patients,
        (SELECT count(*)::int FROM implant_cases WHERE tenant_id = ${tenantId} AND patient_id IN (${idSql})) AS cases,
        (SELECT count(*)::int FROM implants i JOIN implant_cases c ON c.id = i.implant_case_id
          WHERE i.tenant_id = ${tenantId} AND c.patient_id IN (${idSql})) AS implants,
        (SELECT count(*)::int FROM payments p JOIN implant_cases c ON c.id = p.implant_case_id
          WHERE p.tenant_id = ${tenantId} AND c.patient_id IN (${idSql})) AS payments,
        (SELECT count(*)::int FROM followups WHERE tenant_id = ${tenantId} AND patient_id IN (${idSql})) AS followups,
        (SELECT count(*)::int FROM prosthetic_events pe JOIN implant_cases c ON c.id = pe.implant_case_id
          WHERE pe.tenant_id = ${tenantId} AND c.patient_id IN (${idSql})) AS "prostheticEvents"
    `);
    const raw = impactRows.rows[0] as Record<string, unknown>;
    const impact = {
      patients: Number(raw.patients ?? 0),
      cases: Number(raw.cases ?? 0),
      implants: Number(raw.implants ?? 0),
      payments: Number(raw.payments ?? 0),
      followups: Number(raw.followups ?? 0),
      prostheticEvents: Number(raw.prostheticEvents ?? 0),
    };
    if (input.preview) {
      res.json({ action: input.action, preview: true, affected: 0, patientIds, impact });
      return;
    }
    const now = new Date();
    await db.transaction(async (tx) => {
      const updated = await tx.update(patientsTable)
        .set({ archivedAt: input.action === "archive" ? now : null, updatedBy: user.id, updatedAt: now })
        .where(and(
          eq(patientsTable.tenantId, tenantId),
          inArray(patientsTable.id, patientIds),
          input.action === "archive" ? isNull(patientsTable.archivedAt) : isNotNull(patientsTable.archivedAt),
        ))
        .returning({ id: patientsTable.id });
      if (updated.length !== patientIds.length) throw new Error("BULK_PATIENT_STATE_CHANGED");
      for (const patientId of patientIds) {
        await writeAuditRequired({
          tenantId,
          userId: user.id,
          action: input.action === "archive" ? "PATIENT_ARCHIVED" : "PATIENT_RESTORED",
          entityType: "patient",
          entityId: patientId,
          summary: input.action === "archive" ? "Patient archived" : "Patient restored",
        }, tx);
      }
      await writeAuditRequired({
        tenantId,
        userId: user.id,
        action: input.action === "archive" ? "BULK_ARCHIVE" : "BULK_RESTORE",
        entityType: "patient",
        summary: input.action === "archive" ? "Bulk patient archive" : "Bulk patient restore",
        details: { patientIds, count: patientIds.length, impact },
      }, tx);
    });
    res.json({ action: input.action, preview: false, affected: patientIds.length, patientIds, impact });
  },
);

export default router;
