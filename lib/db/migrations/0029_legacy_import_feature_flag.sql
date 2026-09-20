ALTER TABLE "platform_settings"
  ADD COLUMN IF NOT EXISTS "legacy_import_enabled" boolean DEFAULT false NOT NULL;