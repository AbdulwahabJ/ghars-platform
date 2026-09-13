ALTER TABLE "whatsapp_templates" ADD COLUMN "bootstrap_key" text;--> statement-breakpoint
ALTER TABLE "implant_system_options" ADD COLUMN "bootstrap_key" text;--> statement-breakpoint
ALTER TABLE "lookup_options" ADD COLUMN "bootstrap_key" text;--> statement-breakpoint

-- Preserve bootstrap identity for defaults created by the pre-tenant seed
-- migrations. Null remains valid for tenant-created custom values.
UPDATE "implant_system_options" AS options
SET "bootstrap_key" = defaults."bootstrap_key"
FROM (VALUES
  ('ROT / Root', 'implant-system:rot-root'),
  ('Bio', 'implant-system:bio'),
  ('Neodent', 'implant-system:neodent'),
  ('Neoss', 'implant-system:neoss'),
  ('Ora', 'implant-system:ora'),
  ('KOR', 'implant-system:kor'),
  ('Ritt', 'implant-system:ritt'),
  ('MegaGen', 'implant-system:megagen'),
  ('Mediden', 'implant-system:mediden'),
  ('Other', 'implant-system:other')
) AS defaults("name", "bootstrap_key")
WHERE options."bootstrap_key" IS NULL
  AND options."name" = defaults."name";--> statement-breakpoint

UPDATE "lookup_options" AS options
SET "bootstrap_key" = defaults."bootstrap_key"
FROM (VALUES
  ('q_value', '0', 'lookup:q-value:0'),
  ('q_value', '5', 'lookup:q-value:5'),
  ('q_value', '10', 'lookup:q-value:10'),
  ('q_value', '15', 'lookup:q-value:15'),
  ('q_value', '20', 'lookup:q-value:20'),
  ('q_value', '25', 'lookup:q-value:25'),
  ('q_value', '30', 'lookup:q-value:30'),
  ('q_value', '35', 'lookup:q-value:35'),
  ('q_value', '40', 'lookup:q-value:40'),
  ('q_value', '45', 'lookup:q-value:45'),
  ('q_value', '50', 'lookup:q-value:50'),
  ('q_value', '70', 'lookup:q-value:70'),
  ('q_value', '75', 'lookup:q-value:75'),
  ('q_value', '80', 'lookup:q-value:80'),
  ('former_value', 'N', 'lookup:former-value:n'),
  ('former_value', 'Y', 'lookup:former-value:y'),
  ('former_value', 'M17', 'lookup:former-value:m17'),
  ('former_value', 'M30', 'lookup:former-value:m30'),
  ('former_value', 'MST', 'lookup:former-value:mst'),
  ('former_value', 'ST', 'lookup:former-value:st'),
  ('former_value', 'MU15', 'lookup:former-value:mu15'),
  ('former_value', 'MU17', 'lookup:former-value:mu17'),
  ('former_value', 'MU30', 'lookup:former-value:mu30'),
  ('former_value', 'MUST', 'lookup:former-value:must'),
  ('graft_value', 'N', 'lookup:graft-value:n'),
  ('graft_value', 'Y', 'lookup:graft-value:y'),
  ('graft_value', 'ALLO', 'lookup:graft-value:allo'),
  ('procedure_tag', 'DIRECT', 'lookup:procedure-tag:direct'),
  ('procedure_tag', 'IMMED', 'lookup:procedure-tag:immed'),
  ('procedure_tag', 'FLAPLESS', 'lookup:procedure-tag:flapless'),
  ('procedure_tag', 'Sas101', 'lookup:procedure-tag:sas101'),
  ('procedure_tag', 'R.R', 'lookup:procedure-tag:r-r'),
  ('procedure_tag', 'F', 'lookup:procedure-tag:f'),
  ('procedure_tag', 'مؤقت', 'lookup:procedure-tag:5'),
  ('procedure_tag', 'مخصص', 'lookup:procedure-tag:6'),
  ('bone_graft_procedure_type', 'ترقيع عظمي', 'lookup:bone-graft-procedure-type:1'),
  ('bone_graft_procedure_type', 'رفع جيب أنفي', 'lookup:bone-graft-procedure-type:2'),
  ('bone_graft_procedure_type', 'توسيع العظم', 'lookup:bone-graft-procedure-type:3'),
  ('bone_graft_material', 'عظم ذاتي', 'lookup:bone-graft-material:1'),
  ('bone_graft_material', 'عظم صناعي', 'lookup:bone-graft-material:2'),
  ('bone_graft_material', 'عظم بشري معالج', 'lookup:bone-graft-material:3'),
  ('bone_graft_membrane', 'غشاء كولاجين', 'lookup:bone-graft-membrane:1'),
  ('bone_graft_membrane', 'غشاء غير ممتص', 'lookup:bone-graft-membrane:2'),
  ('bone_graft_status', 'مخطط', 'lookup:bone-graft-status:1'),
  ('bone_graft_status', 'تم', 'lookup:bone-graft-status:2'),
  ('bone_graft_status', 'ملغى', 'lookup:bone-graft-status:3')
) AS defaults("category", "value", "bootstrap_key")
WHERE options."bootstrap_key" IS NULL
  AND options."category" = defaults."category"
  AND options."value" = defaults."value";--> statement-breakpoint

UPDATE "whatsapp_templates" AS templates
SET "bootstrap_key" = defaults."bootstrap_key"
FROM (VALUES
  ('Appointment Confirmation', 'whatsapp:appointment-confirmation'),
  ('Appointment Reminder', 'whatsapp:appointment-reminder'),
  ('Post-Implant Follow-up', 'whatsapp:post-implant-follow-up'),
  ('Bone Graft Follow-up', 'whatsapp:bone-graft-follow-up'),
  ('Sinus Lift Follow-up', 'whatsapp:sinus-lift-follow-up'),
  ('Post-Surgical Follow-up', 'whatsapp:post-surgical-follow-up'),
  ('Temporary Prosthetic Appointment', 'whatsapp:temporary-prosthetic-appointment'),
  ('Final Prosthetic Appointment', 'whatsapp:final-prosthetic-appointment'),
  ('Prosthetic Follow-up', 'whatsapp:prosthetic-follow-up'),
  ('Missed Appointment', 'whatsapp:missed-appointment'),
  ('Rescheduling', 'whatsapp:rescheduling'),
  ('General Patient Communication', 'whatsapp:general-patient-communication')
) AS defaults("name", "bootstrap_key")
WHERE templates."bootstrap_key" IS NULL
  AND templates."name" = defaults."name";--> statement-breakpoint

CREATE UNIQUE INDEX "UQ_whatsapp_templates_tenant_bootstrap_key"
  ON "whatsapp_templates" USING btree ("tenant_id", "bootstrap_key");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_implant_system_options_tenant_bootstrap_key"
  ON "implant_system_options" USING btree ("tenant_id", "bootstrap_key");--> statement-breakpoint
CREATE UNIQUE INDEX "UQ_lookup_options_tenant_bootstrap_key"
  ON "lookup_options" USING btree ("tenant_id", "bootstrap_key");