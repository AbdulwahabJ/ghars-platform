import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * Generic Admin-manageable lookup values (charge types, Q suggestions,
 * Former suggestions, Graft suggestions, procedure tags, ...), keyed by
 * category.
 */
export const lookupOptionsTable = pgTable(
  "lookup_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    category: text("category").notNull(),
    value: text("value").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    unique("UQ_lookup_options_category_value").on(table.category, table.value),
  ],
);

export type LookupOptionRow = typeof lookupOptionsTable.$inferSelect;
