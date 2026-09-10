import { desc, eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaylistItems, broadcastPlaylists } from "../../../database/schema";
import type { BroadcastPlaylistItemRecord, BroadcastPlaylistRecord } from "../../../contracts/types";

export async function findPlaylistById(id: string): Promise<BroadcastPlaylistRecord | null> {
  const [row] = await db.select().from(broadcastPlaylists).where(eq(broadcastPlaylists.id, id)).limit(1);
  return (row as BroadcastPlaylistRecord) ?? null;
}

export async function findMaxPlaylistItemOrder(playlistId: string): Promise<number> {
  const rows = await db
    .select({ order: broadcastPlaylistItems.order })
    .from(broadcastPlaylistItems)
    .where(eq(broadcastPlaylistItems.playlistId, playlistId))
    .orderBy(desc(broadcastPlaylistItems.order))
    .limit(1);
  return rows[0]?.order ?? -1;
}

export async function insertLocalPlaylistItem(input: {
  playlistId: string;
  order: number;
  title: string | null;
  relativePath: string;
}): Promise<BroadcastPlaylistItemRecord> {
  const [row] = await db
    .insert(broadcastPlaylistItems)
    .values({ ...input, sourceType: "local" as const, mediaAssetId: null })
    .returning();
  return row as BroadcastPlaylistItemRecord;
}
