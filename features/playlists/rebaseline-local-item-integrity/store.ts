import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaylistItems } from "../../../database/schema";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";

export async function findLocalItemById(itemId: string): Promise<BroadcastPlaylistItemRecord | null> {
  const [row] = await db.select().from(broadcastPlaylistItems).where(eq(broadcastPlaylistItems.id, itemId)).limit(1);
  return (row as BroadcastPlaylistItemRecord) ?? null;
}

export async function updateItemFileIntegrity(itemId: string, input: { fileSizeBytes: number; fileSha256: string }): Promise<void> {
  await db
    .update(broadcastPlaylistItems)
    .set({ fileSizeBytes: input.fileSizeBytes, fileSha256: input.fileSha256, updatedAt: sql`now()` })
    .where(eq(broadcastPlaylistItems.id, itemId));
}
