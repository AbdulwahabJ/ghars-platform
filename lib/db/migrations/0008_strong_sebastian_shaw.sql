CREATE TABLE "installment_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"total_amount" numeric(12, 2) NOT NULL,
	"installment_count" integer NOT NULL,
	"first_due_date" date NOT NULL,
	"created_by" uuid,
	"updated_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CHK_installment_plans_total_positive" CHECK ("installment_plans"."total_amount" > 0),
	CONSTRAINT "CHK_installment_plans_count_range" CHECK ("installment_plans"."installment_count" BETWEEN 1 AND 60)
);
--> statement-breakpoint
CREATE TABLE "installments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"due_date" date NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "CHK_installments_sequence_positive" CHECK ("installments"."sequence" > 0),
	CONSTRAINT "CHK_installments_amount_positive" CHECK ("installments"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "installment_id" uuid;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installment_plans" ADD CONSTRAINT "installment_plans_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "installments" ADD CONSTRAINT "installments_plan_id_installment_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."installment_plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_installment_plans_case_id" ON "installment_plans" USING btree ("implant_case_id");--> statement-breakpoint
CREATE INDEX "IDX_installments_plan_id" ON "installments" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_installments_plan_sequence" ON "installments" USING btree ("plan_id","sequence");--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_installment_id_installments_id_fk" FOREIGN KEY ("installment_id") REFERENCES "public"."installments"("id") ON DELETE no action ON UPDATE no action;