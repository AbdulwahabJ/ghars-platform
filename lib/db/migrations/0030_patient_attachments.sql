CREATE TABLE IF NOT EXISTS "patient_attachments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id"),
  "patient_id" uuid NOT NULL REFERENCES "patients"("id") ON DELETE CASCADE,
  "implant_case_id" uuid REFERENCES "implant_cases"("id") ON DELETE SET NULL,
  "title" text,
  "category" text,
  "note" text,
  "file_date" date,
  "original_filename" text NOT NULL,
  "mime_type" text NOT NULL,
  "file_size" integer NOT NULL,
  "storage_key" text NOT NULL,
  "thumbnail_storage_key" text,
  "uploaded_by" uuid NOT NULL REFERENCES "users"("id"),
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "CHK_patient_attachments_file_size" CHECK ("file_size" > 0 AND "file_size" <= 20971520)
  ,CONSTRAINT "CHK_patient_attachments_category" CHECK ("category" IS NULL OR "category" IN ('RADIOLOGY','MEDICAL_REPORT','CONSENT','REFERRAL','CLINICAL_IMAGE','LAB_RESULT','EXTERNAL_DOCUMENT','OTHER'))
  ,CONSTRAINT "CHK_patient_attachments_mime" CHECK ("mime_type" IN ('image/jpeg','image/png','image/webp','application/pdf'))
  ,CONSTRAINT "CHK_patient_attachments_storage_key" CHECK ("storage_key" ~ '^/objects/patient-attachments/[0-9a-f-]{36}$')
);
CREATE INDEX IF NOT EXISTS "IDX_patient_attachments_tenant_patient" ON "patient_attachments" ("tenant_id", "patient_id");
CREATE INDEX IF NOT EXISTS "IDX_patient_attachments_tenant_case" ON "patient_attachments" ("tenant_id", "implant_case_id");
CREATE UNIQUE INDEX IF NOT EXISTS "UQ_patient_attachments_storage_key" ON "patient_attachments" ("storage_key");