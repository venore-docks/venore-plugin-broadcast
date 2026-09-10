import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastAgendaEvents, broadcastAgendas } from "../../../database/schema";

export async function agendaExists(id: string): Promise<boolean> {
  const [row] = await db.select({ id: broadcastAgendas.id }).from(broadcastAgendas).where(eq(broadcastAgendas.id, id)).limit(1);
  return Boolean(row);
}

export async function bulkInsertAgendaEvents(
  agendaId: string,
  rows: { title: string; startAt: Date; endAt: Date | null; location: string | null; description: string | null }[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const inserted = await db
    .insert(broadcastAgendaEvents)
    .values(
      rows.map((row) => ({
        agendaId,
        title: row.title,
        startAt: row.startAt,
        endAt: row.endAt,
        location: row.location,
        description: row.description,
        recurring: false,
      })),
    )
    .returning({ id: broadcastAgendaEvents.id });
  return inserted.length;
}
