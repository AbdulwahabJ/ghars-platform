CREATE TYPE "public"."tenant_status" AS ENUM('PENDING_VERIFICATION', 'TRIAL', 'ACTIVE', 'SUSPENDED');--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reference_code" text NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"contact_name" text,
	"contact_email" text,
	"contact_phone" text,
	"locale" text DEFAULT 'ar' NOT NULL,
	"status" "tenant_status" DEFAULT 'PENDING_VERIFICATION' NOT NULL,
	"trial_started_at" timestamp with time zone,
	"trial_ends_at" timestamp with time zone,
	"activated_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenants_reference_code_unique" UNIQUE("reference_code")
);--> statement-breakpoint
CREATE TABLE "tenant_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "user_role" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE "platform_admins" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- The legacy single-customer installation becomes an explicit internal tenant.
INSERT INTO "tenants" (
	"id", "reference_code", "name", "legal_name", "locale", "status",
	"activated_at"
) VALUES (
	'00000000-0000-4000-8000-000000000001',
	'internal',
	'Internal',
	'Internal',
	'ar',
	'ACTIVE',
	now()
) ON CONFLICT ("reference_code") DO NOTHING;--> statement-breakpoint

-- Add ownership columns as nullable first so existing rows are retained.
ALTER TABLE "patients" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "implant_cases" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "implants" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "prosthetic_events" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "case_charges" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "case_discounts" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "installments" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "communications" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "implant_system_options" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "lookup_options" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "application_settings" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD COLUMN "tenant_id" uuid;--> statement-breakpoint

INSERT INTO "tenant_memberships" ("tenant_id", "user_id", "role")
SELECT '00000000-0000-4000-8000-000000000001', "id", "role"
FROM "users";--> statement-breakpoint
INSERT INTO "platform_admins" ("user_id")
SELECT "id" FROM "users" WHERE "role" = 'ADMIN'
ON CONFLICT ("user_id") DO NOTHING;--> statement-breakpoint

UPDATE "patients" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "implant_cases" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "implants" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "prosthetic_events" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "bone_graft_procedures" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "payments" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "case_charges" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "case_discounts" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "installment_plans" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "installments" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "followups" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "communications" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "whatsapp_templates" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "implant_system_options" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "lookup_options" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "application_settings" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint
UPDATE "audit_logs" SET "tenant_id" = '00000000-0000-4000-8000-000000000001' WHERE "tenant_id" IS NULL;--> statement-breakpoint

ALTER TABLE "patients" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "implant_cases" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "implants" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "prosthetic_events" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "payments" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "case_charges" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "case_discounts" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "installment_plans" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "installments" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "followups" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "communications" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "implant_system_options" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "lookup_options" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "application_settings" ALTER COLUMN "tenant_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "patients" DROP CONSTRAINT "patients_file_number_unique";--> statement-breakpoint
ALTER TABLE "implant_system_options" DROP CONSTRAINT "implant_system_options_name_unique";--> statement-breakpoint
ALTER TABLE "lookup_options" DROP CONSTRAINT "UQ_lookup_options_category_value";--> statement-breakpoint
DROP INDEX "IDX_patients_full_name_normalized";--> statement-breakpoint
DROP INDEX "IDX_patients_mobile_normalized";--> statement-breakpoint
ALTER TABLE "application_settings" DROP CONSTRAINT "application_settings_pkey";--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_tenant_id_key_pk" PRIMARY KEY("tenant_id","key");--> statement-breakpoint

ALTER TABLE "platform_admins" ADD CONSTRAINT "platform_admins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "tenant_memberships" ADD CONSTRAINT "tenant_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id");--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "implant_cases" ADD CONSTRAINT "implant_cases_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "implants" ADD CONSTRAINT "implants_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "prosthetic_events" ADD CONSTRAINT "prosthetic_events_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ADD CONSTRAINT "bone_graft_procedures_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "case_charges" ADD CONSTRAINT "case_charges_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "case_discounts" ADD CONSTRAINT "case_discounts_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "implant_system_options" ADD CONSTRAINT "implant_system_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "lookup_options" ADD CONSTRAINT "lookup_options_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id");--> statement-breakpoint

CREATE UNIQUE INDEX "UQ_tenant_memberships_tenant_user" ON "tenant_memberships" USING btree ("tenant_id","user_id");--> statement-breakpoint
CREATE INDEX "IDX_tenant_memberships_user_id" ON "tenant_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "IDX_tenants_status" ON "tenants" USING btree ("status");--> statement-breakpoint
CREATE INDEX "IDX_patients_tenant_id" ON "patients" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_patients_tenant_full_name_normalized" ON "patients" USING btree ("tenant_id","full_name_normalized");--> statement-breakpoint
CREATE INDEX "IDX_patients_tenant_mobile_normalized" ON "patients" USING btree ("tenant_id","mobile_normalized");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_patients_tenant_file_number" ON "patients" USING btree ("tenant_id","file_number");--> statement-breakpoint
CREATE INDEX "IDX_implant_cases_tenant_id" ON "implant_cases" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_implants_tenant_id" ON "implants" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_prosthetic_events_tenant_id" ON "prosthetic_events" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_bone_graft_procedures_tenant_id" ON "bone_graft_procedures" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_payments_tenant_id" ON "payments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_case_charges_tenant_id" ON "case_charges" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_case_discounts_tenant_id" ON "case_discounts" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_installment_plans_tenant_id" ON "installment_plans" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_installments_tenant_id" ON "installments" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_followups_tenant_id" ON "followups" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_communications_tenant_id" ON "communications" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_whatsapp_templates_tenant_id" ON "whatsapp_templates" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_implant_system_options_tenant_id" ON "implant_system_options" USING btree ("tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_implant_system_options_tenant_name" ON "implant_system_options" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_lookup_options_tenant_category_value" ON "lookup_options" USING btree ("tenant_id","category","value");--> statement-breakpoint
CREATE INDEX "IDX_application_settings_tenant_id" ON "application_settings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "IDX_audit_logs_tenant_id" ON "audit_logs" USING btree ("tenant_id");--> statement-breakpoint