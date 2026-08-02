import { Router, type IRouter } from "express";
import { communicationsTable, db, whatsappTemplatesTable } from "@workspace/db";
import {
  updateTemplateInputSchema,
  type AdminTemplate,
  type AdminTemplatesResponse,
} from "@workspace/shared";
import { asc, eq, sql } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use("/admin/whatsapp-templates", requireAuth, requireRole("ADMIN"));

const NOT_FOUND = { error: "القالب غير موجود.", code: "TEMPLATE_NOT_FOUND" };

function toDto(row: typeof whatsappTemplatesTable.$inferSelect): AdminTemplate {
  return {
    id: row.id,
    name: row.name,
    body: row.body,
    isApproved: row.isApproved,
    sortOrder: row.sortOrder,
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findTemplate(id: string) {
  const [row] = await db
    .select()
    .from(whatsappTemplatesTable)
    .where(eq(whatsappTemplatesTable.id, id))
    .limit(1);
  return row;
}

/* List ALL templates (including deactivated ones) for management. */
router.get("/admin/whatsapp-templates", async (_req, res) => {
  const rows = await db
    .select()
    .from(whatsappTemplatesTable)
    .orderBy(asc(whatsappTemplatesTable.sortOrder), asc(whatsappTemplatesTable.name));
  const body: AdminTemplatesResponse = { templates: rows.map(toDto) };
  res.json(body);
});

/* Edit name/body — placeholder validation happens in the shared schema. */
router.patch("/admin/whatsapp-templates/:id", async (req, res) => {
  const input = parseOrRespond(updateTemplateInputSchema, req.body, res);
  if (!input) return;
  const template = await findTemplate(req.params.id);
  if (!template) {
    res.status(404).json(NOT_FOUND);
    return;
  }

  const updated = await db.transaction(async (tx) => {
    const [row] = await tx
      .update(whatsappTemplatesTable)
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.body !== undefined ? { body: input.body } : {}),
        updatedAt: new Date(),
      })
      .where(eq(whatsappTemplatesTable.id, template.id))
      .returning();
    await writeAudit(
      {
        userId: req.currentUser!.id,
        action: "template_update",
        entityType: "whatsapp_template",
        entityId: template.id,
        summary: `تعديل قالب واتساب: ${template.name}`,
        details: {
          nameChanged: input.name !== undefined && input.name !== template.name,
          bodyChanged: input.body !== undefined && input.body !== template.body,
        },
      },
      tx,
    );
    return row;
  });
  res.json({ template: toDto(updated) });
});

/* Activate / deactivate. */
for (const [path, approved] of [
  ["activate", true],
  ["deactivate", false],
] as const) {
  router.post(`/admin/whatsapp-templates/:id/${path}`, async (req, res) => {
    const template = await findTemplate(req.params.id);
    if (!template) {
      res.status(404).json(NOT_FOUND);
      return;
    }
    const [updated] = await db
      .update(whatsappTemplatesTable)
      .set({ isApproved: approved, updatedAt: new Date() })
      .where(eq(whatsappTemplatesTable.id, template.id))
      .returning();
    await writeAudit({
      userId: req.currentUser!.id,
      action: approved ? "template_activate" : "template_deactivate",
      entityType: "whatsapp_template",
      entityId: template.id,
      summary: `${approved ? "تفعيل" : "إيقاف"} قالب واتساب: ${template.name}`,
    });
    res.json({ template: toDto(updated) });
  });
}

/* Delete — blocked when any communication references the template. */
router.delete("/admin/whatsapp-templates/:id", async (req, res) => {
  const template = await findTemplate(req.params.id);
  if (!template) {
    res.status(404).json(NOT_FOUND);
    return;
  }
  const [ref] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communicationsTable)
    .where(eq(communicationsTable.templateId, template.id));
  if ((ref?.count ?? 0) > 0) {
    res.status(409).json({
      error:
        "لا يمكن حذف هذا القالب لأنه مستخدم في سجل التواصل. يمكنك إيقافه بدلًا من ذلك.",
      code: "TEMPLATE_REFERENCED",
    });
    return;
  }
  await db.transaction(async (tx) => {
    await tx
      .delete(whatsappTemplatesTable)
      .where(eq(whatsappTemplatesTable.id, template.id));
    await writeAudit(
      {
        userId: req.currentUser!.id,
        action: "template_delete",
        entityType: "whatsapp_template",
        entityId: template.id,
        summary: `حذف قالب واتساب غير مستخدم: ${template.name}`,
      },
      tx,
    );
  });
  res.status(204).end();
});

export default router;
