import { db, platformSettingsTable } from "@workspace/db";

export const DEFAULT_PLATFORM_SETTINGS = {
  supportWhatsapp: process.env.SUPPORT_WHATSAPP ?? null,
  supportPhone: process.env.SUPPORT_PHONE ?? null,
  supportEmail: process.env.SUPPORT_EMAIL ?? null,
  defaultTrialHours: 72,
  legacyImportEnabled: false,
  updatedAt: null as string | null,
};

export async function loadPlatformSettings() {
  const [row] = await db.select().from(platformSettingsTable).limit(1);
  if (!row) return DEFAULT_PLATFORM_SETTINGS;
  return {
    supportWhatsapp: row.supportWhatsapp,
    supportPhone: row.supportPhone,
    supportEmail: row.supportEmail,
    defaultTrialHours: row.defaultTrialHours,
    legacyImportEnabled: row.legacyImportEnabled,
    updatedAt: row.updatedAt.toISOString(),
  };
}