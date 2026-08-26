import { Router, type IRouter } from "express";
import { applicationSettingsTable, db, tenantMembershipsTable, usersTable } from "@workspace/db";
import {
  APP_SETTINGS_DEFAULTS,
  updateAppSettingsInputSchema,
  type AppSettings,
  type AppSettingsResponse,
} from "@workspace/shared";
import { and, eq, sql } from "drizzle-orm";
import { writeAudit } from "../lib/audit";
import { parseOrRespond } from "../lib/validation";
import { requireAuth, requireRole } from "../middlewares/auth";

const router: IRouter = Router();

/** Human labels used in the audit summary for changed settings. */
const SETTING_LABELS: Record<keyof AppSettings, string> = {
  clinicName: "اسم العيادة",
  systemName: "اسم النظام",
  defaultTreatingDoctor: "الطبيب المعالج الافتراضي",
  clinicPhone: "هاتف العيادة",
  clinicAddress: "عنوان العيادة",
  defaultProsValue: "قيمة Pros الافتراضية",
  defaultFollowupAssigneeUserId: "المسؤول الافتراضي عن المتابعات",
  clinicLogo: "شعار العيادة",
};

export async function loadAppSettings(tenantId: string): Promise<AppSettings> {
  const rows = await db
    .select()
    .from(applicationSettingsTable)
    .where(eq(applicationSettingsTable.tenantId, tenantId));
  const map = new Map(rows.map((r) => [r.key, r.value]));
  const merged: Record<string, unknown> = { ...APP_SETTINGS_DEFAULTS };
  for (const key of Object.keys(APP_SETTINGS_DEFAULTS)) {
    if (map.has(key)) {
      merged[key] = map.get(key);
    }
  }
  return merged as AppSettings;
}

/* Any authenticated user needs clinic branding + form defaults. */
router.get("/settings", requireAuth, async (req, res) => {
  const settings = await loadAppSettings(req.currentTenant!.id);
  const body: AppSettingsResponse = { settings };
  res.json(body);
});

router.patch(
  "/admin/settings",
  requireAuth,
  requireRole("ADMIN"),
  async (req, res) => {
    const input = parseOrRespond(updateAppSettingsInputSchema, req.body, res);
    if (!input) return;

    // Referential check for the default follow-up assignee.
    if (input.defaultFollowupAssigneeUserId) {
      const [assignee] = await db
        .select({ id: usersTable.id })
        .from(usersTable)
        .innerJoin(
          tenantMembershipsTable,
          and(
            eq(tenantMembershipsTable.userId, usersTable.id),
            eq(tenantMembershipsTable.tenantId, req.currentTenant!.id),
            eq(tenantMembershipsTable.isActive, true),
          ),
        )
        .where(and(eq(usersTable.id, input.defaultFollowupAssigneeUserId), eq(usersTable.isActive, true)))
        .limit(1);
      if (!assignee) {
        res.status(422).json({
          error: "المستخدم المحدد كمسؤول افتراضي غير موجود أو غير نشط.",
          code: "INVALID_ASSIGNEE",
        });
        return;
      }
    }

    const user = req.currentUser!;
    const tenantId = req.currentTenant!.id;
    const changedKeys = Object.keys(input) as (keyof AppSettings)[];
    await db.transaction(async (tx) => {
      for (const key of changedKeys) {
        // The jsonb column is NOT NULL — cleared settings are stored as
        // JSON null (a valid jsonb value), never SQL NULL.
        const jsonValue = sql`${JSON.stringify(input[key] ?? null)}::jsonb`;
        await tx
          .insert(applicationSettingsTable)
          .values({
            tenantId,
            key,
            value: jsonValue,
            updatedBy: user.id,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [applicationSettingsTable.tenantId, applicationSettingsTable.key],
            set: {
              value: jsonValue,
              updatedBy: user.id,
              updatedAt: new Date(),
            },
          });
      }
      await writeAudit(
        {
          tenantId,
          userId: user.id,
          action: "settings_update",
          entityType: "settings",
          summary: `تحديث إعدادات النظام: ${changedKeys
            .map((k) => SETTING_LABELS[k])
            .join("، ")}`,
          // Never store the logo payload in the audit log.
          details: { keys: changedKeys },
        },
        tx,
      );
    });

    const settings = await loadAppSettings(tenantId);
    const body: AppSettingsResponse = { settings };
    res.json(body);
  },
);

export default router;
