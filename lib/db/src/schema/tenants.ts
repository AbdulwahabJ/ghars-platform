import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { usersTable, userRoleEnum } from "./users";

export const tenantStatusEnum = pgEnum("tenant_status", [
  "PENDING_VERIFICATION",
  "TRIAL",
  "ACTIVE",
  "SUSPENDED",
]);

/** A customer organization and its billing/lifecycle identity. */
export const tenantsTable = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    referenceCode: text("reference_code").notNull().unique(),
    name: text("name").notNull(),
    legalName: text("legal_name"),
    contactName: text("contact_name"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    city: text("city"),
    locale: text("locale").notNull().default("ar"),
    isInternal: boolean("is_internal").notNull().default(false),
    status: tenantStatusEnum("status")
      .notNull()
      .default("PENDING_VERIFICATION"),
    trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    suspendedAt: timestamp("suspended_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_tenants_status").on(table.status),
    uniqueIndex("UQ_tenants_contact_phone")
      .on(table.contactPhone)
      .where(sql`${table.contactPhone} IS NOT NULL`),
  ],
);

/** A user's customer-organization role; roles retain existing permissions. */
export const tenantMembershipsTable = pgTable(
  "tenant_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenantsTable.id),
    userId: uuid("user_id")
      .notNull()
      .references(() => usersTable.id),
    role: userRoleEnum("role").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    canViewFinancials: boolean("can_view_financials"),
    canRecordPayments: boolean("can_record_payments"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    uniqueIndex("UQ_tenant_memberships_tenant_user").on(
      table.tenantId,
      table.userId,
    ),
    index("IDX_tenant_memberships_user_id").on(table.userId),
  ],
);

/**
 * Platform administration is deliberately separate from tenant memberships.
 * Customer ADMIN members must not be able to grant this marker.
 */
export const platformAdminsTable = pgTable("platform_admins", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type Tenant = typeof tenantsTable.$inferSelect;
export type TenantMembership = typeof tenantMembershipsTable.$inferSelect;