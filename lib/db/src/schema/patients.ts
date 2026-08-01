import {
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * Patients.
 * - file_number is globally unique (including archived patients). Creating a
 *   patient with an archived file number triggers a restore dialog in the UI.
 * - mobile_number keeps the user's original input; mobile_normalized is the
 *   normalized digits-only form (NOT unique — family members may share one).
 * - full_name_normalized is maintained by the backend for Arabic-aware search.
 * - archived_at implements soft deletion; patients are never physically
 *   deleted through the normal UI.
 */
export const patientsTable = pgTable(
  "patients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    fileNumber: text("file_number").notNull().unique(),
    fullName: text("full_name").notNull(),
    fullNameNormalized: text("full_name_normalized").notNull(),
    mobileNumber: text("mobile_number"),
    mobileNormalized: text("mobile_normalized"),
    age: integer("age"),
    administrativeNote: text("administrative_note"),
    createdBy: uuid("created_by").references(() => usersTable.id),
    updatedBy: uuid("updated_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("IDX_patients_full_name_normalized").on(table.fullNameNormalized),
    index("IDX_patients_mobile_normalized").on(table.mobileNormalized),
  ],
);

export type PatientRow = typeof patientsTable.$inferSelect;
