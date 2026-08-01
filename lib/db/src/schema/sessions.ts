import { index, jsonb, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

/**
 * Server-side session storage consumed by connect-pg-simple.
 * Shape must match what connect-pg-simple expects (sid/sess/expire).
 */
export const sessionsTable = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_sessions_expire").on(table.expire)],
);
