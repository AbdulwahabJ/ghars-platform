import {
  boolean,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/** Implant system options — Admin-manageable, never hard-coded permanently. */
export const implantSystemOptionsTable = pgTable("implant_system_options", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull().unique(),
  isActive: boolean("is_active").notNull().default(true),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ImplantSystemOptionRow =
  typeof implantSystemOptionsTable.$inferSelect;
