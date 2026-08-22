CREATE TABLE "bone_graft_procedures" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "implant_case_id" uuid NOT NULL,
  "implant_id" uuid,
  "procedure_date" date NOT NULL,
  "procedure_type" text NOT NULL,
  "site" text,
  "material" text,
  "membrane" text,
  "quantity" text,
  "size" text,
  "treating_doctor" text DEFAULT 'د. همام' NOT NULL,
  "procedure_status" text DEFAULT 'مخطط' NOT NULL,
  "note" text,
  "created_by" uuid,
  "updated_by" uuid,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ADD CONSTRAINT "bone_graft_procedures_implant_case_id_implant_cases_id_fk"
  FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ADD CONSTRAINT "bone_graft_procedures_implant_id_implants_id_fk"
  FOREIGN KEY ("implant_id") REFERENCES "public"."implants"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ADD CONSTRAINT "bone_graft_procedures_created_by_users_id_fk"
  FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "bone_graft_procedures" ADD CONSTRAINT "bone_graft_procedures_updated_by_users_id_fk"
  FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "IDX_bone_graft_procedures_case_date" ON "bone_graft_procedures" USING btree ("implant_case_id", "procedure_date");
--> statement-breakpoint
CREATE INDEX "IDX_bone_graft_procedures_date" ON "bone_graft_procedures" USING btree ("procedure_date");
--> statement-breakpoint
INSERT INTO "lookup_options" ("category", "value", "sort_order") VALUES
  ('bone_graft_procedure_type', 'ترقيع عظمي', 0),
  ('bone_graft_procedure_type', 'رفع جيب أنفي', 1),
  ('bone_graft_procedure_type', 'توسيع العظم', 2),
  ('bone_graft_material', 'عظم ذاتي', 0),
  ('bone_graft_material', 'عظم صناعي', 1),
  ('bone_graft_material', 'عظم بشري معالج', 2),
  ('bone_graft_membrane', 'غشاء كولاجين', 0),
  ('bone_graft_membrane', 'غشاء غير ممتص', 1),
  ('bone_graft_status', 'مخطط', 0),
  ('bone_graft_status', 'تم', 1),
  ('bone_graft_status', 'ملغى', 2)
ON CONFLICT ("category", "value") DO NOTHING;