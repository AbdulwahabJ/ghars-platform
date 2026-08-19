CREATE TABLE "prosthetic_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"implant_case_id" uuid NOT NULL,
	"implant_id" uuid,
	"event_type" text NOT NULL,
	"event_date" date NOT NULL,
	"note" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "prosthetic_events" ADD CONSTRAINT "prosthetic_events_implant_case_id_implant_cases_id_fk" FOREIGN KEY ("implant_case_id") REFERENCES "public"."implant_cases"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prosthetic_events" ADD CONSTRAINT "prosthetic_events_implant_id_implants_id_fk" FOREIGN KEY ("implant_id") REFERENCES "public"."implants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prosthetic_events" ADD CONSTRAINT "prosthetic_events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "IDX_prosthetic_events_case_date" ON "prosthetic_events" USING btree ("implant_case_id","event_date");--> statement-breakpoint
CREATE INDEX "IDX_prosthetic_events_date" ON "prosthetic_events" USING btree ("event_date");