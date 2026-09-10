import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";
import type { BroadcastOutputRecord } from "../../../contracts/types";

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

export async function applyOutputHours(
  id: string,
  input: { days: number | null; startMinute: number | null; endMinute: number | null },
): Promise<BroadcastOutputRecord> {
  const [row] = await db
    .update(broadcastOutputs)
    .set({
      activeDays: input.days,
      activeStartMinute: input.startMinute,
      activeEndMinute: input.endMinute,
      updatedAt: sql`now()`,
    })
    .where(eq(broadcastOutputs.id, id))
    .returning();
  return row as BroadcastOutputRecord;
}
