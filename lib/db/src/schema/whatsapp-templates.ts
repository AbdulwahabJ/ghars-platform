import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";

/** Editable WhatsApp message templates, managed by Admin. */
export const whatsappTemplatesTable = pgTable(
  "whatsapp_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    name: text("name").notNull(),
    body: text("body").notNull(),
    /** Stable identity for a template provisioned by tenant bootstrap. */
    bootstrapKey: text("bootstrap_key"),
    isApproved: boolean("is_approved").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_whatsapp_templates_tenant_id").on(table.tenantId),
    uniqueIndex("UQ_whatsapp_templates_tenant_name").on(
      table.tenantId,
      table.name,
    ),
    uniqueIndex("UQ_whatsapp_templates_tenant_bootstrap_key").on(
      table.tenantId,
      table.bootstrapKey,
    ),
  ],
);

export type WhatsappTemplateRow = typeof whatsappTemplatesTable.$inferSelect;
