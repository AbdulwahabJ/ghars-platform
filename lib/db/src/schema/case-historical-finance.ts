import { boolean, index, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { implantCasesTable } from "./implant-cases";
import { importBatchesTable } from "./import-batches";
import { usersTable } from "./users";

/** Verified provenance for amounts that existed before a case entered Ghars. */
export const caseHistoricalFinanceTable = pgTable(
  "case_historical_finance",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
    caseId: uuid("case_id").notNull().references(() => implantCasesTable.id, { onDelete: "cascade" }),
    importBatchId: uuid("import_batch_id").references(() => importBatchesTable.id, { onDelete: "set null" }),
    rawSourceText: text("raw_source_text").notNull(),
    historicalTotalAmount: numeric("historical_total_amount", { precision: 12, scale: 2 }),
    historicalPaidAmount: numeric("historical_paid_amount", { precision: 12, scale: 2 }),
    openingRemainingBalance: numeric("opening_remaining_balance", { precision: 12, scale: 2 }),
    historicalPaymentStatus: text("historical_payment_status"),
    isVerified: boolean("is_verified").notNull().default(false),
    verifiedBy: uuid("verified_by").references(() => usersTable.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("UQ_case_historical_finance_tenant_case").on(table.tenantId, table.caseId),
    index("IDX_case_historical_finance_tenant").on(table.tenantId),
    index("IDX_case_historical_finance_batch").on(table.importBatchId),
  ],
);

export type CaseHistoricalFinanceRow = typeof caseHistoricalFinanceTable.$inferSelect;