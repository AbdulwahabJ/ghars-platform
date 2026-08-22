import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { usersTable } from "./users";

/**
 * A payment schedule is a planning record only. Actual collection remains in
 * payments; installments only describe when the scheduled amount is due.
 */
export const installmentPlansTable = pgTable(
  "installment_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    totalAmount: numeric("total_amount", { precision: 12, scale: 2 }).notNull(),
    installmentCount: integer("installment_count").notNull(),
    firstDueDate: date("first_due_date").notNull(),
    createdBy: uuid("created_by").references(() => usersTable.id),
    updatedBy: uuid("updated_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("UQ_installment_plans_case_id").on(table.implantCaseId),
    check("CHK_installment_plans_total_positive", sql`${table.totalAmount} > 0`),
    check(
      "CHK_installment_plans_count_range",
      sql`${table.installmentCount} BETWEEN 1 AND 60`,
    ),
  ],
);

export const installmentsTable = pgTable(
  "installments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => installmentPlansTable.id),
    sequence: integer("sequence").notNull(),
    dueDate: date("due_date").notNull(),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_installments_plan_id").on(table.planId),
    uniqueIndex("UQ_installments_plan_sequence").on(
      table.planId,
      table.sequence,
    ),
    check("CHK_installments_sequence_positive", sql`${table.sequence} > 0`),
    check("CHK_installments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type InstallmentPlanRow = typeof installmentPlansTable.$inferSelect;
export type InstallmentRow = typeof installmentsTable.$inferSelect;