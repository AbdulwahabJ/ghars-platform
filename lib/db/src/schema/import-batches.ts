import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const importBatchesTable = pgTable(
  "import_batches",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
    importedBy: uuid("imported_by").notNull().references(() => usersTable.id),
    sourceFilename: text("source_filename").notNull(),
    sourceMime: text("source_mime").notNull(),
    status: text("status").notNull().default("ANALYZED"),
    version: integer("version").notNull().default(1),
    sourceRows: jsonb("source_rows").notNull(),
    mappings: jsonb("mappings").notNull(),
    normalizedRows: jsonb("normalized_rows").notNull(),
    createdRecords: jsonb("created_records").notNull().default([]),
    committedRowNumbers: jsonb("committed_row_numbers").notNull().default([]),
    summary: jsonb("summary").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    rolledBackAt: timestamp("rolled_back_at", { withTimezone: true }),
  },
  (table) => [
    index("IDX_import_batches_tenant_id").on(table.tenantId),
    index("IDX_import_batches_imported_by").on(table.importedBy),
    index("IDX_import_batches_status").on(table.status),
  ],
);

export type ImportBatchRow = typeof importBatchesTable.$inferSelect;

export const importMappingsTable = pgTable(
  "import_mappings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenantsTable.id),
    sourceKind: text("source_kind").notNull(),
    sourceValue: text("source_value").notNull(),
    destination: text("destination").notNull(),
    confidence: text("confidence").notNull().default("0.5"),
    approvedBy: uuid("approved_by").references(() => usersTable.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("IDX_import_mappings_tenant_source").on(table.tenantId, table.sourceKind, table.sourceValue),
  ],
);

export type ImportMappingRow = typeof importMappingsTable.$inferSelect;