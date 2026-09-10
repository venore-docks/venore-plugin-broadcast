import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";
import type { BroadcastOutputRecord } from "../../../contracts/types";

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

export async function applyOutputFallback(
  id: string,
  input: { mediaAssetId?: string | null; message?: string | null },
): Promise<BroadcastOutputRecord> {
  const [row] = await db
    .update(broadcastOutputs)
    .set({
      ...(input.mediaAssetId !== undefined ? { fallbackMediaAssetId: input.mediaAssetId } : {}),
      ...(input.message !== undefined ? { fallbackMessage: input.message } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(broadcastOutputs.id, id))
    .returning();
  return row as BroadcastOutputRecord;
}
