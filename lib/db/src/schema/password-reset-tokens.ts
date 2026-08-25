import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { usersTable } from "./users";

/**
 * One-time password reset tokens. The raw token is only sent by email; the
 * database stores its SHA-256 digest so a database read cannot be used to
 * reset an account.
 */
export const passwordResetTokensTable = pgTable(
  "password_reset_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
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
    index("IDX_password_reset_tokens_user").on(table.userId),
    index("IDX_password_reset_tokens_expires").on(table.expiresAt),
  ],
);

export type PasswordResetToken = typeof passwordResetTokensTable.$inferSelect;