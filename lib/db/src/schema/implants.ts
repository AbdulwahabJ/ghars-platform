import {
  boolean,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { usersTable } from "./users";

/**
 * Implants — one database record per implant (never multiple sites in one
 * text field). Q / Former / Graft are preserved legacy values with neutral
 * meaning; they are stored as entered.
 *
 * NOTE: there is deliberately NO graft_cost column. Bone-graft money lives in
 * case_charges rows (type "زراعة عظم") optionally linked via implant_id.
 * Clinical graft info only: graft_value / graft_procedure_type / graft_note.
 */
export const implantsTable = pgTable(
  "implants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    site: text("site").notNull(),
    /** Site must be a valid FDI tooth number or explicitly marked custom. */
    isCustomSite: boolean("is_custom_site").notNull().default(false),
    system: text("system"),
    diameter: numeric("diameter", { precision: 5, scale: 2 }),
    length: numeric("length", { precision: 5, scale: 2 }),
    qValue: text("q_value"),
    formerValue: text("former_value"),
    graftValue: text("graft_value"),
    graftProcedureType: text("graft_procedure_type"),
    graftNote: text("graft_note"),
    procedureTags: text("procedure_tags").array(),
    implantStatus: text("implant_status").notNull().default("مزروعة"),
    implantNote: text("implant_note"),
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
  (table) => [index("IDX_implants_case_id").on(table.implantCaseId)],
);

export type ImplantRow = typeof implantsTable.$inferSelect;
