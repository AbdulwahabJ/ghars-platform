import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", [
  "ADMIN",
  "DOCTOR",
  "ASSISTANT",
]);

/**
 * Users: internal staff only (no public signup).
 *
 * Permission model: effective permission = user-level override (when not
 * null) ?? role default. Role defaults follow the specification:
 * - ADMIN: full access (financials + payments).
 * - DOCTOR: sees financial summaries ONLY if explicitly enabled.
 * - ASSISTANT: records payments ONLY if the Admin enables it.
 */
export const usersTable = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  username: text("username").notNull().unique(),
  /** Normalized email address used for password recovery (optional for legacy users). */
  email: text("email"),
  passwordHash: text("password_hash").notNull(),
  fullName: text("full_name").notNull(),
  role: userRoleEnum("role").notNull(),
  /** Override: null = use role default. */
  canViewFinancials: boolean("can_view_financials"),
  /** Override: null = use role default. */
  canRecordPayments: boolean("can_record_payments"),
  isActive: boolean("is_active").notNull().default(true),
  /** Base-64 data URL for the user's profile photo (optional). */
  avatarData: text("avatar_data"),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type User = typeof usersTable.$inferSelect;
export type InsertUser = typeof usersTable.$inferInsert;
