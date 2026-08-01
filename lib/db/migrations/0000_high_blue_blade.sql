CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'DOCTOR', 'ASSISTANT');--> statement-breakpoint
CREATE TYPE "public"."onboarding_status" AS ENUM('not_started', 'completed', 'skipped');--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"password_hash" text NOT NULL,
	"full_name" text NOT NULL,
	"role" "user_role" NOT NULL,
	"can_view_financials" boolean,
	"can_record_payments" boolean,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username")
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"sid" varchar PRIMARY KEY NOT NULL,
	"sess" jsonb NOT NULL,
	"expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"onboarding_status" "onboarding_status" DEFAULT 'not_started' NOT NULL,
	"onboarding_completed_at" timestamp with time zone,
	"onboarding_skipped_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_preferences_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "patients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"file_number" text NOT NULL,
	"full_name" text NOT NULL,
	"full_name_normalized" text NOT NULL,
	"mobile_number" text,
	"mobile_normalized" text,
	"age" integer,
	"administrative_note" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "patients_file_number_unique" UNIQUE("file_number")
);
--> statement-breakpoint
CREATE TABLE "implant_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"procedure_date" date,
	"treating_doctor" text DEFAULT 'د. همام' NOT NULL,
	"referring_doctor" text,
	"case_status" text DEFAULT 'حالة جديدة' NOT NULL,
	"pros_value" text,
	"expected_prosthetic_date" date,
	"base_treatment_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"general_note" text,
	"legacy_cost_note" text,
	"is_reimplantation" boolean DEFAULT false NOT NULL,
	"reimplantation_reason" text,
	"source_case_id" uuid,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "CHK_implant_cases_base_amount_non_negative" CHECK ("implant_cases"."base_treatment_amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "implants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"site" text NOT NULL,
	"is_custom_site" boolean DEFAULT false NOT NULL,
	"system" text,
	"diameter" numeric(5, 2),
	"length" numeric(5, 2),
	"q_value" text,
	"former_value" text,
	"graft_value" text,
	"graft_procedure_type" text,
	"graft_note" text,
	"procedure_tags" text[],
	"implant_status" text DEFAULT 'مزروعة' NOT NULL,
	"implant_note" text,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"payment_date" date NOT NULL,
	"payment_label" text,
	"payment_method" text,
	"reference_number" text,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" uuid,
	"void_reason" text,
	CONSTRAINT "CHK_payments_amount_positive" CHECK ("payments"."amount" > 0)
);
--> statement-breakpoint
CREATE TABLE "case_charges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"implant_id" uuid,
	"charge_type" text NOT NULL,
	"description" text,
	"amount" numeric(12, 2) NOT NULL,
	"charge_date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CHK_case_charges_amount_non_negative" CHECK ("case_charges"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "case_discounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"discount_date" date NOT NULL,
	"reason" text,
	"approved_by" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CHK_case_discounts_amount_non_negative" CHECK ("case_discounts"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "followups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"followup_type" text NOT NULL,
	"followup_status" text DEFAULT 'مجدولة' NOT NULL,
	"scheduled_at" timestamp with time zone,
	"requires_contact" boolean DEFAULT false NOT NULL,
	"contact_due_at" timestamp with time zone,
	"next_appointment_at" timestamp with time zone,
	"note" text,
	"assigned_user_id" uuid,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "communications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"patient_id" uuid NOT NULL,
	"implant_case_id" uuid,
	"template_id" uuid,
	"communication_reason" text,
	"rendered_message" text,
	"opened_at" timestamp with time zone,
	"communication_result" text,
	"result_note" text,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "whatsapp_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"body" text NOT NULL,
	"is_approved" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "implant_system_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "implant_system_options_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "lookup_options" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category" text NOT NULL,
	"value" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "UQ_lookup_options_category_value" UNIQUE("category","value")
);
--> statement-breakpoint
CREATE TABLE "application_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"action" text NOT NULL,
	"entity_type" text,
	"entity_id" text,
	"summary" text,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user_preferences" ADD CONSTRAINT "user_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "patients" ADD CONSTRAINT "patients_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implant_cases" ADD CONSTRAINT "implant_cases_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implant_cases" ADD CONSTRAINT "implant_cases_source_case_id_implant_cases_id_fk" FOREIGN KEY ("source_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implant_cases" ADD CONSTRAINT "implant_cases_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implant_cases" ADD CONSTRAINT "implant_cases_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implants" ADD CONSTRAINT "implants_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implants" ADD CONSTRAINT "implants_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "implants" ADD CONSTRAINT "implants_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_voided_by_users_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_charges" ADD CONSTRAINT "case_charges_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_charges" ADD CONSTRAINT "case_charges_implant_id_implants_id_fk" FOREIGN KEY ("implant_id") REFERENCES "public"."implants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_charges" ADD CONSTRAINT "case_charges_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_discounts" ADD CONSTRAINT "case_discounts_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_discounts" ADD CONSTRAINT "case_discounts_approved_by_users_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_discounts" ADD CONSTRAINT "case_discounts_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_assigned_user_id_users_id_fk" FOREIGN KEY ("assigned_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_template_id_whatsapp_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."whatsapp_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communications" ADD CONSTRAINT "communications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "application_settings" ADD CONSTRAINT "application_settings_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_sessions_expire" ON "sessions" USING btree ("expire");--> statement-breakpoint
CREATE INDEX "IDX_patients_full_name_normalized" ON "patients" USING btree ("full_name_normalized");--> statement-breakpoint
CREATE INDEX "IDX_patients_mobile_normalized" ON "patients" USING btree ("mobile_normalized");--> statement-breakpoint
CREATE INDEX "IDX_implant_cases_patient_id" ON "implant_cases" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "IDX_implants_case_id" ON "implants" USING btree ("implant_case_id");--> statement-breakpoint
CREATE INDEX "IDX_payments_case_id" ON "payments" USING btree ("implant_case_id");--> statement-breakpoint
CREATE INDEX "IDX_payments_payment_date" ON "payments" USING btree ("payment_date");--> statement-breakpoint
CREATE INDEX "IDX_case_charges_case_id" ON "case_charges" USING btree ("implant_case_id");--> statement-breakpoint
CREATE INDEX "IDX_case_discounts_case_id" ON "case_discounts" USING btree ("implant_case_id");--> statement-breakpoint
CREATE INDEX "IDX_followups_case_id" ON "followups" USING btree ("implant_case_id");--> statement-breakpoint
CREATE INDEX "IDX_followups_scheduled_at" ON "followups" USING btree ("scheduled_at");--> statement-breakpoint
CREATE INDEX "IDX_communications_patient_id" ON "communications" USING btree ("patient_id");--> statement-breakpoint
CREATE INDEX "IDX_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "IDX_audit_logs_user_id" ON "audit_logs" USING btree ("user_id");