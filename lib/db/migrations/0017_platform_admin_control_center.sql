ALTER TABLE "tenants"
  ADD COLUMN IF NOT EXISTS "is_internal" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "tenants"
SET "is_internal" = true
WHERE "reference_code" = 'internal';--> statement-breakpoint
ALTER TABLE "tenant_activation_requests"
  ADD COLUMN IF NOT EXISTS "workflow_status" text DEFAULT 'NEW' NOT NULL;--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "platform_settings" (
  "id" text PRIMARY KEY DEFAULT 'global' NOT NULL,
  "support_whatsapp" text,
  "support_phone" text,
  "support_email" text,
  "default_trial_hours" integer DEFAULT 72 NOT NULL,
  "updated_by" uuid REFERENCES "users"("id"),
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "system_errors" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "reference_code" text NOT NULL UNIQUE,
  "tenant_id" uuid REFERENCES "tenants"("id"),
  "user_id" uuid REFERENCES "users"("id"),
  "route" text NOT NULL,
  "method" text NOT NULL,
  "error_type" text NOT NULL,
  "safe_message" text NOT NULL,
  "environment" text NOT NULL,
  "application_version" text NOT NULL,
  "is_resolved" boolean DEFAULT false NOT NULL,
  "resolution_note" text,
  "resolved_at" timestamp with time zone,
  "resolved_by_user_id" uuid REFERENCES "users"("id"),
  "occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_system_errors_tenant" ON "system_errors" ("tenant_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_system_errors_occurred" ON "system_errors" ("occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "IDX_system_errors_resolved" ON "system_errors" ("is_resolved");