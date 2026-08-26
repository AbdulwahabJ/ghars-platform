import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const platformSettingsTable = pgTable("platform_settings", {
  id: text("id").primaryKey().default("global"),
  supportWhatsapp: text("support_whatsapp"),
  supportPhone: text("support_phone"),
  supportEmail: text("support_email"),
  defaultTrialHours: integer("default_trial_hours").notNull().default(72),
  updatedBy: uuid("updated_by").references(() => usersTable.id),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const systemErrorsTable = pgTable(
  "system_errors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceCode: text("reference_code").notNull().unique(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id),
    userId: uuid("user_id").references(() => usersTable.id),
    route: text("route").notNull(),
    method: text("method").notNull(),
    errorType: text("error_type").notNull(),
    safeMessage: text("safe_message").notNull(),
    environment: text("environment").notNull(),
    applicationVersion: text("application_version").notNull(),
    isResolved: boolean("is_resolved").notNull().default(false),
    resolutionNote: text("resolution_note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => usersTable.id),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("IDX_system_errors_tenant").on(table.tenantId),
    index("IDX_system_errors_occurred").on(table.occurredAt),
    index("IDX_system_errors_resolved").on(table.isResolved),
  ],
);