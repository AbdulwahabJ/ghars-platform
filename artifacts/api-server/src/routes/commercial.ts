import { and, desc, eq, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import {
  db, tenantActivationRequestsTable, tenantsTable,
} from "@workspace/db";
import {
  createActivationRequestInputSchema,
} from "@workspace/shared";
import { parseOrRespond } from "../lib/validation";
import { requireRole } from "../middlewares/auth";
import { loadPlatformSettings } from "../lib/platform-settings";

const router: IRouter = Router();

function requestDto(row: typeof tenantActivationRequestsTable.$inferSelect) {
  return {
    id: row.id, tenantId: row.tenantId, requestedByUserId: row.requestedByUserId,
    status: row.status, note: row.note, createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null,
    resolvedByUserId: row.resolvedByUserId ?? null,
  };
}

router.get("/commercial/status", async (req, res) => {
  const tenant = req.currentTenant;
  if (!tenant) { res.status(403).json({ error: "لا توجد عيادة متاحة لهذا الحساب.", code: "TENANT_ACCESS_REQUIRED" }); return; }
  const [request] = await db.select().from(tenantActivationRequestsTable)
    .where(eq(tenantActivationRequestsTable.tenantId, tenant.id))
    .orderBy(desc(tenantActivationRequestsTable.createdAt)).limit(1);
  const platformSettings = await loadPlatformSettings();
  res.json({
    tenant: {
      id: tenant.id, name: tenant.name, status: tenant.status,
      trialStartedAt: tenant.trialStartedAt?.toISOString() ?? null,
      trialEndsAt: tenant.trialEndsAt?.toISOString() ?? null,
      activatedAt: tenant.activatedAt?.toISOString() ?? null,
      suspendedAt: tenant.suspendedAt?.toISOString() ?? null,
    },
    activationRequest: request ? {
      id: request.id, status: request.status, note: request.note,
      workflowStatus: request.workflowStatus,
      createdAt: request.createdAt.toISOString(), resolvedAt: request.resolvedAt?.toISOString() ?? null,
    } : null,
    support: {
      email: platformSettings.supportEmail,
      phone: platformSettings.supportPhone,
      whatsapp: platformSettings.supportWhatsapp,
    },
  });
});

router.post("/commercial/activation-requests", requireRole("ADMIN"), async (req, res) => {
  const input = parseOrRespond(createActivationRequestInputSchema, req.body, res);
  if (!input) return;
  const tenant = req.currentTenant!;
  const user = req.currentUser!;
  const [created] = await db.insert(tenantActivationRequestsTable).values({
    tenantId: tenant.id, requestedByUserId: user.id, note: input.note ?? null,
  }).onConflictDoNothing().returning();
  if (created) { res.status(201).json({ request: requestDto(created) }); return; }
  const [existing] = await db.select().from(tenantActivationRequestsTable).where(and(
    eq(tenantActivationRequestsTable.tenantId, tenant.id),
    eq(tenantActivationRequestsTable.status, "PENDING"),
  )).limit(1);
  if (!existing) { res.status(409).json({ error: "تعذر إنشاء طلب التفعيل.", code: "ACTIVATION_REQUEST_CONFLICT" }); return; }
  res.json({ request: requestDto(existing) });
});

export default router;