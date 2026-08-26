import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { implantsTable } from "./implants";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/**
 * Canonical, dated clinical bone-graft records.
 *
 * This deliberately does not contain a cost field: financial adjustments stay
 * in case_charges so treatment accounting remains centralized.
 */
export const boneGraftProceduresTable = pgTable(
  "bone_graft_procedures",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    implantId: uuid("implant_id").references(() => implantsTable.id),
    procedureDate: date("procedure_date", { mode: "string" }).notNull(),
    /**
     * Canonical clinical classification. procedureType remains the
     * backward-compatible free-text description used by historical graft rows.
     */
    procedureCategory: text("procedure_category").notNull().default("زراعة عظم"),
    procedureType: text("procedure_type").notNull(),
    procedureSide: text("procedure_side"),
    liftType: text("lift_type"),
    site: text("site"),
    material: text("material"),
    membrane: text("membrane"),
    quantity: text("quantity"),
    size: text("size"),
    treatingDoctor: text("treating_doctor").notNull().default("د. همام"),
    procedureStatus: text("procedure_status").notNull().default("مخطط"),
    note: text("note"),
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
    index("IDX_bone_graft_procedures_tenant_id").on(table.tenantId),
    index("IDX_bone_graft_procedures_case_date").on(
      table.implantCaseId,
      table.procedureDate,
    ),
    index("IDX_bone_graft_procedures_date").on(table.procedureDate),
    index("IDX_bone_graft_procedures_category").on(table.procedureCategory),
  ],
);

export type BoneGraftProcedureRow =
  typeof boneGraftProceduresTable.$inferSelect;