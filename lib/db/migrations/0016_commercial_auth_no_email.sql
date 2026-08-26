ALTER TABLE "users"
  ADD COLUMN "must_change_password" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "tenants"
  ADD COLUMN "city" text;--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_tenants_contact_phone"
  ON "tenants" ("contact_phone")
  WHERE "contact_phone" IS NOT NULL;--> statement-breakpoint
DELETE FROM "tenant_memberships"
WHERE "user_id" IN (SELECT "user_id" FROM "platform_admins");--> statement-breakpoint
UPDATE "tenants"
SET
  "status" = 'TRIAL',
  "trial_started_at" = COALESCE("trial_started_at", CURRENT_TIMESTAMP),
  "trial_ends_at" = COALESCE(
    "trial_ends_at",
    COALESCE("trial_started_at", CURRENT_TIMESTAMP) + interval '72 hours'
  ),
  "updated_at" = CURRENT_TIMESTAMP
WHERE "status" = 'PENDING_VERIFICATION';