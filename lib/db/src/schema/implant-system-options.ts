import {
  boolean,
  integer,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/** Implant system options — Admin-manageable, never hard-coded permanently. */
export const implantSystemOptionsTable = pgTable(
  "implant_system_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    name: text("name").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_implant_system_options_tenant_id").on(table.tenantId),
    uniqueIndex("UQ_implant_system_options_tenant_name").on(
      table.tenantId,
      table.name,
    ),
  ],
);

export type ImplantSystemOptionRow =
  typeof implantSystemOptionsTable.$inferSelect;
