import { pgEnum, pgTable, timestamp, uuid } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const onboardingStatusEnum = pgEnum("onboarding_status", [
  "not_started",
  "completed",
  "skipped",
]);

export const localeEnum = pgEnum("locale", ["ar", "en"]);

/** One preferences record per user (UNIQUE user_id). No patient data here. */
export const userPreferencesTable = pgTable("user_preferences", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .unique()
    .references(() => usersTable.id),
  locale: localeEnum("locale").notNull().default("ar"),
  onboardingStatus: onboardingStatusEnum("onboarding_status")
    .notNull()
    .default("not_started"),
  onboardingCompletedAt: timestamp("onboarding_completed_at", {
    withTimezone: true,
  }),
  onboardingSkippedAt: timestamp("onboarding_skipped_at", {
    withTimezone: true,
  }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type UserPreferences = typeof userPreferencesTable.$inferSelect;
