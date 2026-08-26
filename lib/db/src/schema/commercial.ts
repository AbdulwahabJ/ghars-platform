import { sql } from "drizzle-orm";
import {
  check,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { tenantsTable } from "./tenants";
import { usersTable } from "./users";

export const activationRequestStatusEnum = pgEnum("activation_request_status", [
  "PENDING",
  "APPROVED",
  "REJECTED",
]);

/**
 * Raw verification values are only ever sent by email. Keeping their SHA-256
 * digest makes a database disclosure insufficient to verify an account.
 */
export const emailVerificationTokensTable = pgTable(
  "email_verification_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_email_verification_tokens_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
    index("IDX_email_verification_tokens_expires").on(table.expiresAt),
  ],
);

/**
 * A normalized, globally unique claim is created only for public tenant
 * owners. It deliberately does not alter nullable legacy users.email values.
 */
export const tenantOwnerEmailClaimsTable = pgTable(
  "tenant_owner_email_claims",
  {
    email: text("email").primaryKey(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" })
      .unique(),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" })
      .unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    check(
      "tenant_owner_email_claims_normalized_email",
      sql`${table.email} = lower(${table.email})`,
    ),
  ],
);

export const tenantActivationRequestsTable = pgTable(
  "tenant_activation_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id, { onDelete: "cascade" }),
    requestedByUserId: uuid("requested_by_user_id")
      .notNull()
      .references(() => usersTable.id),
    status: activationRequestStatusEnum("status").notNull().default("PENDING"),
    workflowStatus: text("workflow_status").notNull().default("NEW"),
    note: text("note"),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    resolvedByUserId: uuid("resolved_by_user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_tenant_activation_requests_tenant").on(table.tenantId),
    index("IDX_tenant_activation_requests_status").on(table.status),
    uniqueIndex("UQ_tenant_activation_requests_pending")
      .on(table.tenantId)
      .where(sql`${table.status} = 'PENDING'`),
  ],
);

export type EmailVerificationToken =
  typeof emailVerificationTokensTable.$inferSelect;
export type TenantOwnerEmailClaim =
  typeof tenantOwnerEmailClaimsTable.$inferSelect;
export type TenantActivationRequest =
  typeof tenantActivationRequestsTable.$inferSelect;