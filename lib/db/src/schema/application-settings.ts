import { jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/** Key-value application settings, editable from the UI (Admin only). */
export const applicationSettingsTable = pgTable("application_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedBy: uuid("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type ApplicationSettingRow =
  typeof applicationSettingsTable.$inferSelect;
