import { asc, eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaylistItems, broadcastPlaylists } from "../../../database/schema";
import type { BroadcastPlaylistRecord } from "../../../contracts/types";

export async function findPlaylistById(id: string): Promise<BroadcastPlaylistRecord | null> {
  const [row] = await db.select().from(broadcastPlaylists).where(eq(broadcastPlaylists.id, id)).limit(1);
  return (row as BroadcastPlaylistRecord) ?? null;
}

// Cria a cópia + os itens numa transação. A cópia é sempre compartilhada (owner_output_id null).
export async function duplicatePlaylistWithItems(source: BroadcastPlaylistRecord): Promise<BroadcastPlaylistRecord> {
  return db.transaction(async (tx) => {
    const [copy] = await tx
      .insert(broadcastPlaylists)
      .values({ name: `Cópia de ${source.name}`, folderPath: source.folderPath, ownerOutputId: null })
      .returning();

    const items = await tx
      .select()
      .from(broadcastPlaylistItems)
      .where(eq(broadcastPlaylistItems.playlistId, source.id))
      .orderBy(asc(broadcastPlaylistItems.order), asc(broadcastPlaylistItems.createdAt), asc(broadcastPlaylistItems.id));

    if (items.length > 0) {
      await tx.insert(broadcastPlaylistItems).values(
        items.map((item) => ({
          playlistId: copy.id,
          order: item.order,
          title: item.title,
          sourceType: item.sourceType,
          relativePath: item.relativePath,
          mediaAssetId: item.mediaAssetId,
          url: item.url,
          agendaEventId: item.agendaEventId,
          durationSeconds: item.durationSeconds,
          hidden: item.hidden,
          withAudio: item.withAudio,
          visibleFrom: item.visibleFrom,
          visibleUntil: item.visibleUntil,
        })),
      );
    }

    return copy as BroadcastPlaylistRecord;
  });
}
