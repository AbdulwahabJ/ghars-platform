ALTER TABLE "followups" ADD COLUMN "patient_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "followups" ADD COLUMN "result" text;--> statement-breakpoint
ALTER TABLE "followups" ADD CONSTRAINT "followups_patient_id_patients_id_fk" FOREIGN KEY ("patient_id") REFERENCES "public"."patients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_followups_patient_id" ON "followups" USING btree ("patient_id");