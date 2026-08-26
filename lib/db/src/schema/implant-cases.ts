import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { patientsTable } from "./patients";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/**
 * Implant cases. Money is numeric(12,2) — never floats.
 * Derived totals (paid / outstanding / final) are NEVER stored; they are
 * computed in queries from payments / charges / discounts.
 */
export const implantCasesTable = pgTable(
  "implant_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patientsTable.id),
    procedureDate: date("procedure_date"),
    treatingDoctor: text("treating_doctor").notNull().default("د. همام"),
    referringDoctor: text("referring_doctor"),
    caseStatus: text("case_status").notNull().default("حالة جديدة"),
    prosValue: text("pros_value"),
    expectedProstheticDate: date("expected_prosthetic_date"),
    baseTreatmentAmount: numeric("base_treatment_amount", {
      precision: 12,
      scale: 2,
    })
      .notNull()
      .default("0"),
    generalNote: text("general_note"),
    legacyCostNote: text("legacy_cost_note"),
    isReimplantation: boolean("is_reimplantation").notNull().default(false),
    reimplantationReason: text("reimplantation_reason"),
    sourceCaseId: uuid("source_case_id").references(
      (): AnyPgColumn => implantCasesTable.id,
    ),
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
    index("IDX_implant_cases_tenant_id").on(table.tenantId),
    index("IDX_implant_cases_patient_id").on(table.patientId),
    check(
      "CHK_implant_cases_base_amount_non_negative",
      sql`${table.baseTreatmentAmount} >= 0`,
    ),
  ],
);

export type ImplantCaseRow = typeof implantCasesTable.$inferSelect;
