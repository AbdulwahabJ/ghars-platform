import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/**
 * Generic Admin-manageable lookup values (charge types, Q suggestions,
 * Former suggestions, Graft suggestions, procedure tags, ...), keyed by
 * category.
 */
export const lookupOptionsTable = pgTable(
  "lookup_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    category: text("category").notNull(),
    value: text("value").notNull(),
    /** Stable identity for a value provisioned by tenant bootstrap. */
    bootstrapKey: text("bootstrap_key"),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("UQ_lookup_options_tenant_category_value").on(
      table.tenantId,
      table.category,
      table.value,
    ),
    uniqueIndex("UQ_lookup_options_tenant_bootstrap_key").on(
      table.tenantId,
      table.bootstrapKey,
    ),
  ],
);

export type LookupOptionRow = typeof lookupOptionsTable.$inferSelect;
