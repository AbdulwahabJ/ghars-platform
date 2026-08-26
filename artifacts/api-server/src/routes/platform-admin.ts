import { and, asc, desc, eq, ilike, sql } from "drizzle-orm";
import { Router, type IRouter } from "express";
import type { Request, Response } from "express";
import { db, tenantActivationRequestsTable, tenantMembershipsTable, tenantsTable } from "@workspace/db";
import { extendTrialInputSchema, platformTenantListInputSchema, resolveActivationRequestInputSchema } from "@workspace/shared";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";

const router: IRouter = Router();
const dto = (t: typeof tenantsTable.$inferSelect) => ({
  id: t.id, referenceCode: t.referenceCode, name: t.name, contactEmail: t.contactEmail,
  locale: t.locale === "en" ? "en" : "ar", status: t.status,
  trialStartedAt: t.trialStartedAt?.toISOString() ?? null, trialEndsAt: t.trialEndsAt?.toISOString() ?? null,
  activatedAt: t.activatedAt?.toISOString() ?? null, suspendedAt: t.suspendedAt?.toISOString() ?? null,
  createdAt: t.createdAt.toISOString(),
});

router.get("/platform-admin/tenants", async (req, res) => {
  const input = parseOrRespond(platformTenantListInputSchema, req.query, res); if (!input) return;
  const conditions = [input.status ? eq(tenantsTable.status, input.status) : undefined, input.query ? ilike(tenantsTable.name, `%${input.query}%`) : undefined].filter(Boolean);
  const rows = await db.select().from(tenantsTable).where(conditions.length ? and(...conditions) : undefined).orderBy(asc(tenantsTable.createdAt)).limit(input.limit).offset((input.page - 1) * input.limit);
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(tenantsTable).where(conditions.length ? and(...conditions) : undefined);
  const items = await Promise.all(rows.map(async (t) => {
    const [{ count: userCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(tenantMembershipsTable).where(eq(tenantMembershipsTable.tenantId, t.id));
    const [{ count: activationRequestCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(tenantActivationRequestsTable).where(eq(tenantActivationRequestsTable.tenantId, t.id));
    return { ...dto(t), userCount, activationRequestCount };
  }));
  res.json({ items, total: count, page: input.page, limit: input.limit });
});

router.get("/platform-admin/tenants/:tenantId", async (req, res) => {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, String(req.params.tenantId))).limit(1);
  if (!tenant) { res.status(404).json({ error: "العيادة غير موجودة.", code: "TENANT_NOT_FOUND" }); return; }
  const requests = await db.select().from(tenantActivationRequestsTable).where(eq(tenantActivationRequestsTable.tenantId, tenant.id)).orderBy(desc(tenantActivationRequestsTable.createdAt));
  const [{ count: userCount }] = await db.select({ count: sql<number>`count(*)::int` }).from(tenantMembershipsTable).where(eq(tenantMembershipsTable.tenantId, tenant.id));
  res.json({ tenant: { ...dto(tenant), legalName: tenant.legalName, contactName: tenant.contactName, contactPhone: tenant.contactPhone, userCount, activationRequestCount: requests.length, activationRequests: requests.map((r) => ({ ...r, createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(), resolvedAt: r.resolvedAt?.toISOString() ?? null, resolvedByUserId: r.resolvedByUserId ?? null })) } });
});

async function changeStatus(req: Request, res: Response, mode: "activate" | "suspend" | "reactivate") {
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, String(req.params.tenantId))).limit(1);
  if (!tenant) { res.status(404).json({ error: "العيادة غير موجودة.", code: "TENANT_NOT_FOUND" }); return; }
  const now = new Date();
  let values: Partial<typeof tenantsTable.$inferInsert>;
  if (mode === "activate") values = { status: "ACTIVE", activatedAt: now, suspendedAt: null, updatedAt: now };
  else if (mode === "suspend") values = { status: "SUSPENDED", suspendedAt: now, updatedAt: now };
  else values = tenant.activatedAt ? { status: "ACTIVE", suspendedAt: null, updatedAt: now } : (tenant.trialEndsAt && tenant.trialEndsAt > now ? { status: "TRIAL", suspendedAt: null, updatedAt: now } : { status: "SUSPENDED", updatedAt: now });
  const [updated] = await db.update(tenantsTable).set(values).where(eq(tenantsTable.id, tenant.id)).returning();
  await writeAudit({ tenantId: tenant.id, userId: req.currentUser!.id, action: `platform_tenant_${mode}`, entityType: "tenant", entityId: tenant.id, summary: "إجراء إدارة منصة على العيادة" });
  res.json({ tenant: { ...dto(updated), userCount: 0, activationRequestCount: 0 } });
}
router.post("/platform-admin/tenants/:tenantId/activate", (req, res) => changeStatus(req, res, "activate"));
router.post("/platform-admin/tenants/:tenantId/suspend", (req, res) => changeStatus(req, res, "suspend"));
router.post("/platform-admin/tenants/:tenantId/reactivate", (req, res) => changeStatus(req, res, "reactivate"));
router.post("/platform-admin/tenants/:tenantId/extend-trial", async (req, res) => {
  const input = parseOrRespond(extendTrialInputSchema, req.body, res); if (!input) return;
  const [tenant] = await db.select().from(tenantsTable).where(eq(tenantsTable.id, req.params.tenantId)).limit(1);
  if (!tenant) { res.status(404).json({ error: "العيادة غير موجودة.", code: "TENANT_NOT_FOUND" }); return; }
  const base = tenant.trialEndsAt && tenant.trialEndsAt > new Date() ? tenant.trialEndsAt : new Date();
  const [updated] = await db.update(tenantsTable).set({ status: "TRIAL", trialStartedAt: tenant.trialStartedAt ?? new Date(), trialEndsAt: new Date(base.getTime() + input.days * 86400000), suspendedAt: null, updatedAt: new Date() }).where(eq(tenantsTable.id, tenant.id)).returning();
  await writeAudit({ tenantId: tenant.id, userId: req.currentUser!.id, action: "platform_tenant_extend_trial", entityType: "tenant", entityId: tenant.id, summary: "تمديد الفترة التجريبية" });
  res.json({ tenant: { ...dto(updated), userCount: 0, activationRequestCount: 0 } });
});
router.post("/platform-admin/activation-requests/:requestId/:decision", async (req, res) => {
  const input = parseOrRespond(resolveActivationRequestInputSchema, req.body, res); if (!input) return;
  const status = req.params.decision === "approve" ? "APPROVED" : req.params.decision === "reject" ? "REJECTED" : null;
  if (!status) { res.status(404).json({ error: "الإجراء غير موجود.", code: "NOT_FOUND" }); return; }
  const [updated] = await db.update(tenantActivationRequestsTable).set({ status, note: input.note, resolvedAt: new Date(), resolvedByUserId: req.currentUser!.id, updatedAt: new Date() }).where(and(eq(tenantActivationRequestsTable.id, req.params.requestId), eq(tenantActivationRequestsTable.status, "PENDING"))).returning();
  if (!updated) { res.status(404).json({ error: "طلب التفعيل غير موجود أو تمت معالجته.", code: "ACTIVATION_REQUEST_NOT_FOUND" }); return; }
  await writeAudit({ tenantId: updated.tenantId, userId: req.currentUser!.id, action: `platform_activation_request_${status.toLowerCase()}`, entityType: "activation_request", entityId: updated.id, summary: "معالجة طلب تفعيل" });
  res.json({ request: { ...updated, createdAt: updated.createdAt.toISOString(), updatedAt: updated.updatedAt.toISOString(), resolvedAt: updated.resolvedAt?.toISOString() ?? null, resolvedByUserId: updated.resolvedByUserId ?? null } });
});
export default router;