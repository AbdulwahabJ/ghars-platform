import {
  date,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { implantsTable } from "./implants";
import { usersTable } from "./users";

/**
 * Explicit clinical prosthetic/installation events.
 *
 * eventDate is the authoritative Riyadh calendar day used by operational
 * summaries. createdAt is audit metadata only and must never be used as a
 * substitute for the clinical event date.
 */
export const prostheticEventsTable = pgTable(
  "prosthetic_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    implantCaseId: uuid("implant_case_id")
      .notNull()
      .references(() => implantCasesTable.id),
    implantId: uuid("implant_id").references(() => implantsTable.id),
    eventType: text("event_type").notNull(),
    eventDate: date("event_date", { mode: "string" }).notNull(),
    note: text("note"),
    createdBy: uuid("created_by").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("IDX_prosthetic_events_case_date").on(
      table.implantCaseId,
      table.eventDate,
    ),
    index("IDX_prosthetic_events_date").on(table.eventDate),
  ],
);

export type ProstheticEventRow = typeof prostheticEventsTable.$inferSelect;