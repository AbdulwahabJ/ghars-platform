import {
  boolean,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { usersTable } from "./users";

/**
 * Follow-ups drive the dashboard operational cards; status is structured,
 * never inferred from free-text notes.
 */
export const followupsTable = pgTable(
  "followups",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    followupType: text("followup_type").notNull(),
    followupStatus: text("followup_status").notNull().default("مجدولة"),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
    requiresContact: boolean("requires_contact").notNull().default(false),
    contactDueAt: timestamp("contact_due_at", { withTimezone: true }),
    nextAppointmentAt: timestamp("next_appointment_at", { withTimezone: true }),
    note: text("note"),
    assignedUserId: uuid("assigned_user_id").references(() => usersTable.id),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("IDX_followups_case_id").on(table.implantCaseId),
    index("IDX_followups_scheduled_at").on(table.scheduledAt),
  ],
);

export type FollowupRow = typeof followupsTable.$inferSelect;
