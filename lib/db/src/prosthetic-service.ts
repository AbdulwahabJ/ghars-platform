import { and, eq, isNull } from "drizzle-orm";
import {
  implantsTable,
  prostheticEventsTable,
  type ImplantRow,
  type ProstheticEventRow,
} from "./schema";
import type { db } from "./index";
import {
  IMPLANT_STATUS_BY_PROSTHETIC_EVENT,
  PROSTHETIC_EVENT_TYPES,
} from "@workspace/shared";

/** The subset shared by the Drizzle database and transaction handles. */
export type ProstheticDbWriter = Pick<typeof db, "select" | "insert" | "update">;

export interface ProstheticAuditEntry {
  tenantId: string;
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  summary: string;
  details?: Record<string, unknown>;
}

export type ProstheticAuditWriter = (
  entry: ProstheticAuditEntry,
  writer: ProstheticDbWriter,
) => Promise<void>;

export function synchronizedImplantStatus(
  eventType: (typeof PROSTHETIC_EVENT_TYPES)[number],
): (typeof IMPLANT_STATUS_BY_PROSTHETIC_EVENT)[typeof eventType] {
  return IMPLANT_STATUS_BY_PROSTHETIC_EVENT[eventType];
}

export interface CreateProstheticEventInput {
  id?: string;
  tenantId: string;
  implantCaseId: string;
  implantId: string | null;
  eventType: (typeof PROSTHETIC_EVENT_TYPES)[number];
  eventDate: string;
  note: string | null;
  createdBy: string;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Canonical prosthetic-event transaction used by both API writes and
 * controlled data preparation. It creates the event, records the same audit
 * entries as the API, and synchronizes a linked implant status atomically.
 */
export async function createProstheticEventWithStatusSync(
  writer: ProstheticDbWriter,
  input: CreateProstheticEventInput,
  writeAudit: ProstheticAuditWriter,
): Promise<{ event: ProstheticEventRow; implant: ImplantRow | null }> {
  const values = {
    ...(input.id ? { id: input.id } : {}),
    tenantId: input.tenantId,
    implantCaseId: input.implantCaseId,
    implantId: input.implantId,
    eventType: input.eventType,
    eventDate: input.eventDate,
    note: input.note,
    createdBy: input.createdBy,
    ...(input.createdAt ? { createdAt: input.createdAt } : {}),
  };
  const [event] = await writer.insert(prostheticEventsTable).values(values).returning();

  await writeAudit(
    {
      tenantId: input.tenantId,
      userId: input.createdBy,
      action: "prosthetic_event_create",
      entityType: "prosthetic_event",
      entityId: event.id,
      summary: `توثيق ${event.eventType}`,
    },
    writer,
  );

  if (!input.implantId) return { event, implant: null };
  const [linkedImplant] = await writer
    .select()
    .from(implantsTable)
    .where(
      and(
        eq(implantsTable.id, input.implantId),
        eq(implantsTable.implantCaseId, input.implantCaseId),
        eq(implantsTable.tenantId, input.tenantId),
        isNull(implantsTable.archivedAt),
      ),
    )
    .limit(1);
  if (!linkedImplant) throw new Error("لا يمكن توثيق التركيب لهذه الزرعة.");

  const targetStatus = IMPLANT_STATUS_BY_PROSTHETIC_EVENT[input.eventType];
  if (linkedImplant.implantStatus === targetStatus) {
    return { event, implant: linkedImplant };
  }
  const [updatedImplant] = await writer
    .update(implantsTable)
    .set({
      implantStatus: targetStatus,
      updatedBy: input.createdBy,
      updatedAt: input.updatedAt ?? new Date(),
    })
    .where(
      and(
        eq(implantsTable.id, linkedImplant.id),
        eq(implantsTable.tenantId, input.tenantId),
        isNull(implantsTable.archivedAt),
      ),
    )
    .returning();
  if (!updatedImplant) throw new Error("لا يمكن توثيق التركيب لهذه الزرعة.");

  await writeAudit(
    {
      tenantId: input.tenantId,
      userId: input.createdBy,
      action: "implant_update",
      entityType: "implant",
      entityId: updatedImplant.id,
      summary: `تحديث حالة زرعة السن ${updatedImplant.site}`,
      details: {
        changedFields: ["implantStatus"],
        source: "prosthetic_event_create",
        eventType: event.eventType,
      },
    },
    writer,
  );
  return { event, implant: updatedImplant };
}