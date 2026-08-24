ALTER TABLE "bone_graft_procedures"
  ADD COLUMN "procedure_category" text DEFAULT 'زراعة عظم' NOT NULL,
  ADD COLUMN "procedure_side" text,
  ADD COLUMN "lift_type" text;
--> statement-breakpoint
CREATE INDEX "IDX_bone_graft_procedures_category" ON "bone_graft_procedures" USING btree ("procedure_category");