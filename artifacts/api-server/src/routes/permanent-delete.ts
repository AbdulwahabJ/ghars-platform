import { Router, type IRouter } from "express";
import { sql } from "drizzle-orm";
import { db } from "@workspace/db";
import {
  permanentCaseDeleteRequestSchema,
  permanentPatientDeleteRequestSchema,
} from "@workspace/shared";
import { writeAuditRequired } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireOperationalTenant, requireRole } from "../middlewares/auth";
import { z } from "zod";
import { createHash } from "node:crypto";

const router: IRouter = Router();
const SAFE = { error: "تعذر تنفيذ الحذف الدائم.", code: "PERMANENT_DELETE_FAILED" };
const STALE = { error: "انتهت صلاحية المعاينة. أعد المعاينة قبل التأكيد.", code: "PERMANENT_DELETE_PREVIEW_STALE" };

type Impact = Record<string, number>;
const zeroImpact = (cases = 0, patients = 0): Impact => ({
  patients, cases, implants: 0, boneGraftProcedures: 0, prostheticEvents: 0,
  followups: 0, communications: 0, payments: 0, charges: 0, discounts: 0,
  installmentPlans: 0, installments: 0, historicalFinance: 0, importBatches: 0,
  importMappings: 0, importedCases: 0,
});
function num(v: unknown): number { return Number(v ?? 0); }

/** The recursive set is deliberately tenant constrained at every level. */
async function caseImpact(caseIds: string[], tenantId: string, patientIds?: string[], executor: any = db) {
  const ids = sql`ARRAY[${sql.join(caseIds.map((x) => sql`${x}::uuid`), sql`, `)}]`;
  const patientClause = patientIds?.length
    ? sql` OR (ic.patient_id = ANY(${sql`ARRAY[${sql.join(patientIds.map((x) => sql`${x}::uuid`), sql`, `)}]`}::uuid[]))`
    : sql``;
  const q = await executor.execute(sql`
    WITH RECURSIVE picked AS (
      SELECT id FROM implant_cases ic
      WHERE ic.tenant_id=${tenantId} AND (ic.id = ANY(${ids}::uuid[]) ${patientClause})
      UNION
      SELECT child.id FROM implant_cases child JOIN picked p ON child.source_case_id=p.id
      WHERE child.tenant_id=${tenantId}
    )
    SELECT
      (SELECT count(*) FROM picked)::int AS cases,
      (SELECT count(*) FROM implants WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS implants,
      (SELECT count(*) FROM bone_graft_procedures WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS "boneGraftProcedures",
      (SELECT count(*) FROM prosthetic_events WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS "prostheticEvents",
      (SELECT count(*) FROM followups WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS followups,
      (SELECT count(*) FROM communications WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS communications,
      (SELECT count(*) FROM payments WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS payments,
      (SELECT count(*) FROM case_charges WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS charges,
      (SELECT count(*) FROM case_discounts WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS discounts,
      (SELECT count(*) FROM installment_plans WHERE tenant_id=${tenantId} AND implant_case_id IN (SELECT id FROM picked))::int AS "installmentPlans",
      (SELECT count(*) FROM installments WHERE tenant_id=${tenantId} AND plan_id IN (SELECT id FROM installment_plans WHERE implant_case_id IN (SELECT id FROM picked)))::int AS installments,
      (SELECT count(*) FROM case_historical_finance WHERE tenant_id=${tenantId} AND case_id IN (SELECT id FROM picked))::int AS "historicalFinance",
      (SELECT count(*) FROM import_batches b WHERE b.tenant_id=${tenantId}
        AND EXISTS (SELECT 1 FROM picked p WHERE b.created_records::text LIKE '%' || p.id::text || '%'))::int AS "importBatches",
      (SELECT count(*) FROM picked p WHERE EXISTS (SELECT 1 FROM import_batches b WHERE b.tenant_id=${tenantId} AND b.created_records::text LIKE '%' || p.id::text || '%'))::int AS "importedCases"
  `);
  const row = (q.rows[0] ?? {}) as Record<string, unknown>;
  return { ...zeroImpact(), ...Object.fromEntries(Object.entries(row).map(([k, v]) => [k, num(v)])) };
}
async function importContext(ids: string[], tenantId: string, executor: any = db) {
  if (!ids.length) return [];
  const arr = sql`ARRAY[${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)}]`;
  const result = await executor.execute(sql`WITH RECURSIVE picked AS (
    SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${arr}::uuid[])
    UNION SELECT c.id FROM implant_cases c JOIN picked p ON c.source_case_id=p.id WHERE c.tenant_id=${tenantId}
  )
  SELECT b.id, b.source_filename AS "sourceFilename", b.status
  FROM import_batches b WHERE b.tenant_id=${tenantId}
    AND EXISTS (SELECT 1 FROM picked p WHERE b.created_records::text LIKE '%' || p.id::text || '%')
  ORDER BY b.id`);
  return result.rows;
}
function previewToken(tenantId: string, subject: string, impact: Impact, batches: unknown[], caseIds: string[]) {
  return createHash("sha256").update(JSON.stringify({ tenantId, subject, caseIds: [...caseIds].sort(), impact, batches })).digest("hex");
}
async function resolveAndLock(tx: any, ids: string[], tenantId: string, patientId?: string) {
  const arr = sql`ARRAY[${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)}]`;
  if (patientId) {
    await tx.execute(sql`SELECT id FROM patients WHERE tenant_id=${tenantId} AND id=${patientId} FOR UPDATE`);
  }
  await tx.execute(sql`WITH RECURSIVE picked AS (
    SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${arr}::uuid[])
    ${patientId ? sql`UNION SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND patient_id=${patientId}` : sql``}
    UNION SELECT c.id FROM implant_cases c JOIN picked p ON c.source_case_id=p.id WHERE c.tenant_id=${tenantId}
  ) SELECT id FROM implant_cases WHERE id IN (SELECT id FROM picked) FOR UPDATE`);
}
async function resolvedCaseIds(executor: any, ids: string[], tenantId: string, patientId?: string): Promise<string[]> {
  const arr = sql`ARRAY[${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)}]`;
  const result = await executor.execute(sql`WITH RECURSIVE picked AS (
    SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${arr}::uuid[])
    ${patientId ? sql`UNION SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND patient_id=${patientId}` : sql``}
    UNION SELECT c.id FROM implant_cases c JOIN picked p ON c.source_case_id=p.id WHERE c.tenant_id=${tenantId}
  ) SELECT id FROM picked ORDER BY id`);
  return result.rows.map((r: { id: string }) => String(r.id));
}

async function deleteCases(tx: any, ids: string[], tenantId: string) {
  const arr = sql`ARRAY[${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)}]`;
  // Explicit child-before-parent ordering also makes this safe if a deployment
  // has stricter foreign keys than the current schema.
  const tables: Array<{ name: string; predicate: ReturnType<typeof sql> }> = [
    { name: "payments", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "installments", predicate: sql`plan_id IN (SELECT id FROM installment_plans WHERE implant_case_id IN (SELECT id FROM picked))` },
    { name: "installment_plans", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "case_historical_finance", predicate: sql`case_id IN (SELECT id FROM picked)` },
    { name: "case_charges", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "case_discounts", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "communications", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "followups", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "prosthetic_events", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "bone_graft_procedures", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
    { name: "implants", predicate: sql`implant_case_id IN (SELECT id FROM picked)` },
  ];
  /* Keep the ordering explicit: every child table precedes implant_cases. */
  for (const { name, predicate } of tables) {
    await tx.execute(sql`WITH RECURSIVE picked AS (
      SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${arr}::uuid[])
      UNION SELECT c.id FROM implant_cases c JOIN picked p ON c.source_case_id=p.id WHERE c.tenant_id=${tenantId}
    ) DELETE FROM ${sql.raw(name)} WHERE tenant_id=${tenantId} AND ${predicate}`);
  }
  await tx.execute(sql`WITH RECURSIVE picked AS (
    SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${arr}::uuid[])
    UNION SELECT c.id FROM implant_cases c JOIN picked p ON c.source_case_id=p.id WHERE c.tenant_id=${tenantId}
  ) DELETE FROM implant_cases WHERE tenant_id=${tenantId} AND id IN (SELECT id FROM picked)`);
}

router.use(requireAuth, requireOperationalTenant);
router.post("/implant-cases/bulk-permanent-delete", requireRole("ADMIN"), async (req, res) => {
  const input = parseOrRespond(permanentCaseDeleteRequestSchema, req.body, res); if (!input) return;
  const tenantId = req.currentTenant!.id;
  const ids: string[] = [...new Set(input.caseIds)];
  try {
    const found = await db.execute(sql`SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${sql`ARRAY[${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)}]`}::uuid[])`);
    if (found.rows.length !== ids.length) { res.status(422).json(SAFE); return; }
    const resolved = await resolvedCaseIds(db, ids, tenantId);
    const impact = await caseImpact(ids, tenantId);
    const importBatchContext = await importContext(resolved, tenantId);
    const token = previewToken(tenantId, "cases", impact, importBatchContext, resolved);
    if (input.preview) { res.json({ preview: true, previewToken: token, caseIds: resolved, impact, importBatchContext }); return; }
    if (input.confirmed !== true) { res.status(400).json(SAFE); return; }
    await db.transaction(async (tx) => {
      const roots = await tx.execute(sql`SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${sql`ARRAY[${sql.join(ids.map((x) => sql`${x}::uuid`), sql`, `)}]`}::uuid[]) FOR UPDATE`);
      if (roots.rows.length !== ids.length) throw Object.assign(new Error("stale"), { stale: true });
      await resolveAndLock(tx, ids, tenantId);
      const currentIds = await resolvedCaseIds(tx, ids, tenantId);
      const currentImpact = await caseImpact(ids, tenantId, undefined, tx);
      const currentBatches = await importContext(currentIds, tenantId, tx);
      if (previewToken(tenantId, "cases", currentImpact, currentBatches, currentIds) !== input.previewToken) throw Object.assign(new Error("stale"), { stale: true });
      const before = await tx.execute(sql`SELECT count(*)::int AS count FROM implant_cases WHERE tenant_id=${tenantId} AND id IN (SELECT unnest(${sql`ARRAY[${sql.join(currentIds.map((x) => sql`${x}::uuid`), sql`, `)}]`}::uuid[]))`);
      await writeAuditRequired({ tenantId, userId: req.currentUser!.id, action: "PERMANENT_CASE_DELETE", entityType: "implant_case", summary: "Permanent case deletion", details: { caseIds: currentIds, counts: currentImpact, importBatchIds: currentBatches.map((b: { id: unknown }) => b.id) } }, tx);
      await deleteCases(tx, ids, tenantId);
      const remaining = await tx.execute(sql`SELECT count(*)::int AS count FROM implant_cases WHERE tenant_id=${tenantId} AND id=ANY(${sql`ARRAY[${sql.join(currentIds.map((x) => sql`${x}::uuid`), sql`, `)}]`}::uuid[])`);
      const deletedCount = Number((before.rows[0] as { count: unknown }).count) - Number((remaining.rows[0] as { count: unknown }).count);
      if (Number((remaining.rows[0] as { count: unknown }).count) !== 0 || deletedCount !== currentImpact.cases) throw new Error("delete incomplete");
    });
    res.json({ preview: false, deleted: impact, importBatchContext });
  } catch (err) { if ((err as { stale?: boolean }).stale) { res.status(409).json(STALE); return; } res.status(500).json(SAFE); }
});

router.post("/patients/:id/permanent-delete", requireRole("ADMIN"), async (req, res) => {
  const input = parseOrRespond(permanentPatientDeleteRequestSchema, req.body, res); if (!input) return;
  const tenantId = req.currentTenant!.id; const patientId = String(req.params.id);
  if (!z.string().uuid().safeParse(patientId).success) { res.status(404).json(SAFE); return; }
  try {
    const patient = await db.execute(sql`SELECT id FROM patients WHERE tenant_id=${tenantId} AND id=${patientId}`);
    if (!patient.rows.length) { res.status(422).json(SAFE); return; }
    const cases = await db.execute(sql`SELECT id FROM implant_cases WHERE tenant_id=${tenantId} AND patient_id=${patientId}`);
    const ids = cases.rows.map((r) => String((r as { id: string }).id));
    const resolved = await resolvedCaseIds(db, ids.length ? ids : [patientId], tenantId, patientId);
    const impact = await caseImpact(ids.length ? ids : [patientId], tenantId, [patientId]);
    const importBatchContext = await importContext(resolved, tenantId);
    impact.patients = 1;
    const direct = await db.execute(sql`SELECT
      (SELECT count(*) FROM communications WHERE tenant_id=${tenantId} AND patient_id=${patientId})::int communications,
      (SELECT count(*) FROM followups WHERE tenant_id=${tenantId} AND patient_id=${patientId})::int followups`);
    Object.assign(impact, Object.fromEntries(Object.entries(direct.rows[0] as Record<string, unknown>).map(([k,v])=>[k,num(v)])));
    const token = previewToken(tenantId, patientId, impact, importBatchContext, resolved);
    if (input.preview) { res.json({ preview: true, previewToken: token, caseIds: resolved, impact, importBatchContext }); return; }
    if (input.confirmed !== true) { res.status(400).json(SAFE); return; }
    await db.transaction(async (tx) => {
      const patientLock = await tx.execute(sql`SELECT id FROM patients WHERE tenant_id=${tenantId} AND id=${patientId} FOR UPDATE`);
      if (patientLock.rows.length !== 1) throw Object.assign(new Error("stale"), { stale: true });
      await resolveAndLock(tx, ids.length ? ids : [patientId], tenantId, patientId);
      const currentIds = await resolvedCaseIds(tx, ids.length ? ids : [patientId], tenantId, patientId);
      const currentImpact = await caseImpact(ids.length ? ids : [patientId], tenantId, [patientId], tx);
      const currentBatches = await importContext(currentIds, tenantId, tx);
      const directCurrent = await tx.execute(sql`SELECT
        (SELECT count(*) FROM communications WHERE tenant_id=${tenantId} AND patient_id=${patientId})::int communications,
        (SELECT count(*) FROM followups WHERE tenant_id=${tenantId} AND patient_id=${patientId})::int followups`);
      Object.assign(currentImpact, Object.fromEntries(Object.entries(directCurrent.rows[0] as Record<string, unknown>).map(([k,v])=>[k,num(v)])));
      currentImpact.patients = 1;
      if (previewToken(tenantId, patientId, currentImpact, currentBatches, currentIds) !== input.previewToken) throw Object.assign(new Error("stale"), { stale: true });
      await writeAuditRequired({ tenantId, userId: req.currentUser!.id, action: "PERMANENT_PATIENT_DELETE", entityType: "patient", entityId: patientId, summary: "Permanent patient deletion", details: { patientId, counts: currentImpact, importBatchIds: currentBatches.map((b: { id: unknown }) => b.id) } }, tx);
      await tx.execute(sql`DELETE FROM communications WHERE tenant_id=${tenantId} AND patient_id=${patientId}`);
      await tx.execute(sql`DELETE FROM followups WHERE tenant_id=${tenantId} AND patient_id=${patientId}`);
      if (ids.length) await deleteCases(tx, ids, tenantId);
      await tx.execute(sql`DELETE FROM patients WHERE tenant_id=${tenantId} AND id=${patientId}`);
      const deleted = await tx.execute(sql`SELECT count(*)::int AS count FROM patients WHERE tenant_id=${tenantId} AND id=${patientId}`);
      if (Number((deleted.rows[0] as { count: unknown }).count) !== 0) throw new Error("delete incomplete");
    });
    res.json({ preview: false, deleted: impact, importBatchContext });
  } catch (err) { if ((err as { stale?: boolean }).stale) { res.status(409).json(STALE); return; } res.status(500).json(SAFE); }
});
export default router;