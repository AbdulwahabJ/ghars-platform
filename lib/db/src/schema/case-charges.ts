import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { implantsTable } from "./implants";
import { usersTable } from "./users";

/**
 * Additional charges — separate transactions (never merged into the base
 * treatment amount). Bone-graft charges (type "زراعة عظم") may optionally
 * reference the implant they belong to; the backend must validate that the
 * implant belongs to the same case.
 */
export const caseChargesTable = pgTable(
  "case_charges",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    implantId: uuid("implant_id").references(() => implantsTable.id),
    chargeType: text("charge_type").notNull(),
    description: text("description"),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    chargeDate: date("charge_date").notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_case_charges_case_id").on(table.implantCaseId),
    check("CHK_case_charges_amount_non_negative", sql`${table.amount} >= 0`),
  ],
);

export type CaseChargeRow = typeof caseChargesTable.$inferSelect;
