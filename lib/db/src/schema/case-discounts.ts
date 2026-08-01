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
import { usersTable } from "./users";

/**
 * Discounts — separate records; a discount never overwrites the original
 * treatment amount. Final totals are computed, never stored.
 */
export const caseDiscountsTable = pgTable(
  "case_discounts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    discountDate: date("discount_date").notNull(),
    reason: text("reason"),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_case_discounts_case_id").on(table.implantCaseId),
    check("CHK_case_discounts_amount_non_negative", sql`${table.amount} >= 0`),
  ],
);

export type CaseDiscountRow = typeof caseDiscountsTable.$inferSelect;
