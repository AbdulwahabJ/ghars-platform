import {
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/** Key-value application settings, editable from the UI (Admin only). */
export const applicationSettingsTable = pgTable(
  "application_settings",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    key: text("key").notNull(),
    value: jsonb("value").notNull(),
    updatedBy: uuid("updated_by").references(() => usersTable.id),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tenantId, table.key] }),
    index("IDX_application_settings_tenant_id").on(table.tenantId),
  ],
);

export type ApplicationSettingRow =
  typeof applicationSettingsTable.$inferSelect;
