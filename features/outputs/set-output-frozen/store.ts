import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";
import type { BroadcastOutputRecord } from "../../../contracts/types";

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

export async function applyOutputFrozen(id: string, frozen: boolean): Promise<BroadcastOutputRecord> {
  const [row] = await db
    .update(broadcastOutputs)
    .set({ frozen, updatedAt: sql`now()` })
    .where(eq(broadcastOutputs.id, id))
    .returning();
  return row as BroadcastOutputRecord;
}
