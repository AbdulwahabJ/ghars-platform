import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { tenantsTable } from "./tenants";
import { patientsTable } from "./patients";
import { implantCasesTable } from "./implant-cases";
import { usersTable } from "./users";

export const patientAttachmentsTable = pgTable("patient_attachments", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
  patientId: uuid("patient_id").notNull().references(() => patientsTable.id, { onDelete: "cascade" }),
  implantCaseId: uuid("implant_case_id").references(() => implantCasesTable.id, { onDelete: "set null" }),
  title: text("title"),
  category: text("category"),
  note: text("note"),
  fileDate: date("file_date", { mode: "string" }),
  originalFilename: text("original_filename").notNull(),
  mimeType: text("mime_type").notNull(),
  fileSize: integer("file_size").notNull(),
  storageKey: text("storage_key").notNull(),
  thumbnailStorageKey: text("thumbnail_storage_key"),
  uploadedBy: uuid("uploaded_by").notNull().references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index("IDX_patient_attachments_tenant_patient").on(table.tenantId, table.patientId),
  index("IDX_patient_attachments_tenant_case").on(table.tenantId, table.implantCaseId),
  check("CHK_patient_attachments_file_size", sql`${table.fileSize} > 0 AND ${table.fileSize} <= 20971520`),
  check("CHK_patient_attachments_category", sql`${table.category} IS NULL OR ${table.category} IN ('RADIOLOGY','MEDICAL_REPORT','CONSENT','REFERRAL','CLINICAL_IMAGE','LAB_RESULT','EXTERNAL_DOCUMENT','OTHER')`),
  check("CHK_patient_attachments_mime", sql`${table.mimeType} IN ('image/jpeg','image/png','image/webp','application/pdf')`),
  check("CHK_patient_attachments_storage_key", sql`${table.storageKey} ~ '^/objects/patient-attachments/[0-9a-f-]{36}$'`),
  uniqueIndex("UQ_patient_attachments_storage_key").on(table.storageKey),
]);

export type PatientAttachment = typeof patientAttachmentsTable.$inferSelect;