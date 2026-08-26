import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { tenantsTable } from "./tenants";

/** Admin-only audit trail. Summaries must be safe (no secrets, no payloads). */
export const auditLogsTable = pgTable(
  "audit_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenantsTable.id),
    userId: uuid("user_id").references(() => usersTable.id),
    action: text("action").notNull(),
    entityType: text("entity_type"),
    entityId: text("entity_id"),
    summary: text("summary"),
    details: jsonb("details"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_audit_logs_tenant_id").on(table.tenantId),
    index("IDX_audit_logs_created_at").on(table.createdAt),
    index("IDX_audit_logs_user_id").on(table.userId),
  ],
);

export type AuditLogRow = typeof auditLogsTable.$inferSelect;
