import { Router, type IRouter } from "express";
import {
  db,
  boneGraftProceduresTable,
  implantSystemOptionsTable,
  implantsTable,
  lookupOptionsTable,
} from "@workspace/db";
import {
  ADMIN_LOOKUP_CATEGORY_LABELS,
  createLookupOptionInputSchema,
  reorderLookupOptionsInputSchema,
  updateLookupOptionInputSchema,
  type AdminLookupCategory,
  type AdminLookupOption,
  type AdminLookupsResponse,
} from "@workspace/shared";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/lookups", requireAuth, requireRole("ADMIN"));

const NOT_FOUND = { error: "الخيار غير موجود.", code: "OPTION_NOT_FOUND" };

function isUniqueViolation(err: unknown): boolean {
  let current: unknown = err;
  while (current instanceof Error) {
    if ((current as { code?: string }).code === "23505") return true;
    current = current.cause;
  }
  return false;
}

/** Which implant column references each lookup category. */
const REFERENCE_COLUMNS = {
  q_value: implantsTable.qValue,
  former_value: implantsTable.formerValue,
  graft_value: implantsTable.graftValue,
  bone_graft_procedure_type: boneGraftProceduresTable.procedureType,
  bone_graft_material: boneGraftProceduresTable.material,
  bone_graft_membrane: boneGraftProceduresTable.membrane,
  bone_graft_status: boneGraftProceduresTable.procedureStatus,
} as const;

async function referencedValues(
  category: AdminLookupCategory,
  values: string[],
): Promise<Set<string>> {
  if (values.length === 0) return new Set();
  if (category === "implant_system") {
    const rows = await db
      .selectDistinct({ v: implantsTable.system })
      .from(implantsTable)
      .where(inArray(implantsTable.system, values));
    return new Set(rows.map((r) => r.v).filter((v): v is string => !!v));
  }
  if (category === "procedure_tag") {
    const rows = await db.execute(sql`
      SELECT DISTINCT tag AS v
      FROM implants, unnest(procedure_tags) AS tag
      WHERE tag IN (${sql.join(values.map((v) => sql`${v}`), sql`, `)})
    `);
    return new Set((rows.rows as { v: string }[]).map((r) => r.v));
  }
  if (
    category === "bone_graft_procedure_type" ||
    category === "bone_graft_material" ||
    category === "bone_graft_membrane" ||
    category === "bone_graft_status"
  ) {
    const column = REFERENCE_COLUMNS[category];
    const rows = await db
      .selectDistinct({ v: column })
      .from(boneGraftProceduresTable)
      .where(inArray(column, values));
    return new Set(rows.map((r) => r.v).filter((v): v is string => !!v));
  }
  const column = REFERENCE_COLUMNS[category];
  const rows = await db
    .selectDistinct({ v: column })
    .from(implantsTable)
    .where(inArray(column, values));
  return new Set(rows.map((r) => r.v).filter((v): v is string => !!v));
}

type OptionRow = {
  id: string;
  value: string;
  isActive: boolean;
  sortOrder: number;
};

async function listCategory(category: AdminLookupCategory): Promise<OptionRow[]> {
  if (category === "implant_system") {
    const rows = await db
      .select({
        id: implantSystemOptionsTable.id,
        value: implantSystemOptionsTable.name,
        isActive: implantSystemOptionsTable.isActive,
        sortOrder: implantSystemOptionsTable.sortOrder,
      })
      .from(implantSystemOptionsTable)
      .orderBy(
        asc(implantSystemOptionsTable.sortOrder),
        asc(implantSystemOptionsTable.name),
      );
    return rows;
  }
  return db
    .select({
      id: lookupOptionsTable.id,
      value: lookupOptionsTable.value,
      isActive: lookupOptionsTable.isActive,
      sortOrder: lookupOptionsTable.sortOrder,
    })
    .from(lookupOptionsTable)
    .where(eq(lookupOptionsTable.category, category))
    .orderBy(asc(lookupOptionsTable.sortOrder), asc(lookupOptionsTable.value));
}

async function findOption(
  category: AdminLookupCategory,
  id: string,
): Promise<OptionRow | undefined> {
  const rows = await listCategory(category);
  return rows.find((r) => r.id === id);
}

function categoryOr400(req: { params: { category?: string } }, res: import("express").Response): AdminLookupCategory | undefined {
  const category = req.params.category as AdminLookupCategory | undefined;
  if (!category || !(category in ADMIN_LOOKUP_CATEGORY_LABELS)) {
    res.status(400).json({ error: "فئة القائمة غير معروفة.", code: "VALIDATION_ERROR" });
    return undefined;
  }
  return category;
}

/* ------------------------------------------------------------------ */
/* List all categories (with reference flags)                          */
/* ------------------------------------------------------------------ */

router.get("/admin/lookups", async (_req, res) => {
  const categories = Object.keys(
    ADMIN_LOOKUP_CATEGORY_LABELS,
  ) as AdminLookupCategory[];
  const options: AdminLookupOption[] = [];
  for (const category of categories) {
    const rows = await listCategory(category);
    const referenced = await referencedValues(
      category,
      rows.map((r) => r.value),
    );
    for (const row of rows) {
      options.push({
        id: row.id,
        category,
        value: row.value,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
        isReferenced: referenced.has(row.value),
      });
    }
  }
  const body: AdminLookupsResponse = { options };
  res.json(body);
});

/* ------------------------------------------------------------------ */
/* Create                                                              */
/* ------------------------------------------------------------------ */

router.post("/admin/lookups", async (req, res) => {
  const input = parseOrRespond(createLookupOptionInputSchema, req.body, res);
  if (!input) return;
  const user = req.currentUser!;

  try {
    const existing = await listCategory(input.category);
    const nextOrder =
      existing.reduce((max, r) => Math.max(max, r.sortOrder), 0) + 1;
    let created: OptionRow;
    if (input.category === "implant_system") {
      const [row] = await db
        .insert(implantSystemOptionsTable)
        .values({ name: input.value, sortOrder: nextOrder })
        .returning();
      created = {
        id: row.id,
        value: row.name,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      };
    } else {
      const [row] = await db
        .insert(lookupOptionsTable)
        .values({
          category: input.category,
          value: input.value,
          sortOrder: nextOrder,
        })
        .returning();
      created = {
        id: row.id,
        value: row.value,
        isActive: row.isActive,
        sortOrder: row.sortOrder,
      };
    }
    await writeAudit({
      userId: user.id,
      action: "lookup_create",
      entityType: "lookup_option",
      entityId: created.id,
      summary: `إضافة خيار "${input.value}" إلى ${ADMIN_LOOKUP_CATEGORY_LABELS[input.category]}`,
    });
    res.status(201).json({
      option: {
        id: created.id,
        category: input.category,
        value: created.value,
        isActive: created.isActive,
        sortOrder: created.sortOrder,
        isReferenced: false,
      } satisfies AdminLookupOption,
    });
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        error: "هذه القيمة موجودة بالفعل في هذه القائمة.",
        code: "DUPLICATE_OPTION",
      });
      return;
    }
    throw err;
  }
});

/* ------------------------------------------------------------------ */
/* Edit display label                                                  */
/* ------------------------------------------------------------------ */

router.patch("/admin/lookups/:category/:id", async (req, res) => {
  const category = categoryOr400(req, res);
  if (!category) return;
  const input = parseOrRespond(updateLookupOptionInputSchema, req.body, res);
  if (!input) return;

  const option = await findOption(category, req.params.id);
  if (!option) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  try {
    if (category === "implant_system") {
      await db
        .update(implantSystemOptionsTable)
        .set({ name: input.value })
        .where(eq(implantSystemOptionsTable.id, option.id));
    } else {
      await db
        .update(lookupOptionsTable)
        .set({ value: input.value })
        .where(eq(lookupOptionsTable.id, option.id));
    }
  } catch (err) {
    if (isUniqueViolation(err)) {
      res.status(409).json({
        error: "هذه القيمة موجودة بالفعل في هذه القائمة.",
        code: "DUPLICATE_OPTION",
      });
      return;
    }
    throw err;
  }
  // Historical records store the raw text value, so they keep displaying
  // the old label — renaming only affects future selections.
  await writeAudit({
    userId: req.currentUser!.id,
    action: "lookup_update",
    entityType: "lookup_option",
    entityId: option.id,
    summary: `تعديل خيار في ${ADMIN_LOOKUP_CATEGORY_LABELS[category]}: "${option.value}" ← "${input.value}"`,
  });
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Activate / deactivate                                               */
/* ------------------------------------------------------------------ */

for (const [path, active] of [
  ["activate", true],
  ["deactivate", false],
] as const) {
  router.post(`/admin/lookups/:category/:id/${path}`, async (req, res) => {
    const category = categoryOr400(req, res);
    if (!category) return;
    const option = await findOption(category, req.params.id);
    if (!option) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    if (category === "implant_system") {
      await db
        .update(implantSystemOptionsTable)
        .set({ isActive: active })
        .where(eq(implantSystemOptionsTable.id, option.id));
    } else {
      await db
        .update(lookupOptionsTable)
        .set({ isActive: active })
        .where(eq(lookupOptionsTable.id, option.id));
    }
    await writeAudit({
      userId: req.currentUser!.id,
      action: active ? "lookup_activate" : "lookup_deactivate",
      entityType: "lookup_option",
      entityId: option.id,
      summary: `${active ? "تفعيل" : "إيقاف"} الخيار "${option.value}" في ${ADMIN_LOOKUP_CATEGORY_LABELS[category]}`,
    });
    res.status(204).end();
  });
}

/* ------------------------------------------------------------------ */
/* Delete (blocked when referenced by historical records)              */
/* ------------------------------------------------------------------ */

router.delete("/admin/lookups/:category/:id", async (req, res) => {
  const category = categoryOr400(req, res);
  if (!category) return;
  const option = await findOption(category, req.params.id);
  if (!option) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const referenced = await referencedValues(category, [option.value]);
  if (referenced.has(option.value)) {
    res.status(409).json({
      error:
        "لا يمكن حذف هذا الخيار لأنه مستخدم في سجلات سابقة. يمكنك إيقافه بدلًا من ذلك.",
      code: "OPTION_REFERENCED",
    });
    return;
  }
  if (category === "implant_system") {
    await db
      .delete(implantSystemOptionsTable)
      .where(eq(implantSystemOptionsTable.id, option.id));
  } else {
    await db
      .delete(lookupOptionsTable)
      .where(eq(lookupOptionsTable.id, option.id));
  }
  await writeAudit({
    userId: req.currentUser!.id,
    action: "lookup_delete",
    entityType: "lookup_option",
    entityId: option.id,
    summary: `حذف الخيار غير المستخدم "${option.value}" من ${ADMIN_LOOKUP_CATEGORY_LABELS[category]}`,
  });
  res.status(204).end();
});

/* ------------------------------------------------------------------ */
/* Reorder                                                             */
/* ------------------------------------------------------------------ */

router.post("/admin/lookups/reorder", async (req, res) => {
  const input = parseOrRespond(reorderLookupOptionsInputSchema, req.body, res);
  if (!input) return;

  const rows = await listCategory(input.category);
  const known = new Set(rows.map((r) => r.id));
  if (
    input.orderedIds.length !== rows.length ||
    input.orderedIds.some((id) => !known.has(id))
  ) {
    res.status(422).json({
      error: "قائمة الترتيب لا تطابق خيارات هذه الفئة. حدِّث الصفحة وحاول مجددًا.",
      code: "REORDER_MISMATCH",
    });
    return;
  }

  await db.transaction(async (tx) => {
    for (const [index, id] of input.orderedIds.entries()) {
      if (input.category === "implant_system") {
        await tx
          .update(implantSystemOptionsTable)
          .set({ sortOrder: index + 1 })
          .where(eq(implantSystemOptionsTable.id, id));
      } else {
        await tx
          .update(lookupOptionsTable)
          .set({ sortOrder: index + 1 })
          .where(eq(lookupOptionsTable.id, id));
      }
    }
    await writeAudit(
      {
        userId: req.currentUser!.id,
        action: "lookup_reorder",
        entityType: "lookup_option",
        summary: `إعادة ترتيب ${ADMIN_LOOKUP_CATEGORY_LABELS[input.category]}`,
      },
      tx,
    );
  });
  res.status(204).end();
});

export default router;
