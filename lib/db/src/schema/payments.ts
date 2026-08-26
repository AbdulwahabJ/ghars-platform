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
import { installmentsTable } from "./installment-plans";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/**
 * Payments — immutable financial records. Never physically deleted;
 * corrections use the controlled void fields (voided_at / voided_by /
 * void_reason) with confirmation + audit. Paid totals are always computed
 * from non-voided rows, never stored.
 */
export const paymentsTable = pgTable(
  "payments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    installmentId: uuid("installment_id").references(() => installmentsTable.id),
    amount: numeric("amount", { precision: 12, scale: 2 }).notNull(),
    paymentDate: date("payment_date").notNull(),
    paymentLabel: text("payment_label"),
    paymentMethod: text("payment_method"),
    referenceNumber: text("reference_number"),
    note: text("note"),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    voidedAt: timestamp("voided_at", { withTimezone: true }),
    voidedBy: uuid("voided_by").references(() => usersTable.id),
    voidReason: text("void_reason"),
  },
  (table) => [
    index("IDX_payments_tenant_id").on(table.tenantId),
    index("IDX_payments_case_id").on(table.implantCaseId),
    index("IDX_payments_payment_date").on(table.paymentDate),
    check("CHK_payments_amount_positive", sql`${table.amount} > 0`),
  ],
);

export type PaymentRow = typeof paymentsTable.$inferSelect;
