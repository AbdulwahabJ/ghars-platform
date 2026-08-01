import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { implantCasesTable } from "./implant-cases";
import { patientsTable } from "./patients";
import { usersTable } from "./users";
import { whatsappTemplatesTable } from "./whatsapp-templates";

/**
 * Communication log — records that a WhatsApp link was opened and the result
 * manually recorded by the user. The app never claims delivery/read status
 * and never stores WhatsApp conversations.
 */
export const communicationsTable = pgTable(
  "communications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    patientId: uuid("patient_id")
      .notNull()
      .references(() => patientsTable.id),
    implantCaseId: uuid("implant_case_id").references(
      () => implantCasesTable.id,
    ),
    templateId: uuid("template_id").references(() => whatsappTemplatesTable.id),
    communicationReason: text("communication_reason"),
    renderedMessage: text("rendered_message"),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    communicationResult: text("communication_result"),
    resultNote: text("result_note"),
    userId: uuid("user_id").references(() => usersTable.id),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("IDX_communications_patient_id").on(table.patientId)],
);

export type CommunicationRow = typeof communicationsTable.$inferSelect;
