import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaylistItems } from "../../../database/schema";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";

export async function findPlaylistItemById(id: string): Promise<BroadcastPlaylistItemRecord | null> {
  const [row] = await db.select().from(broadcastPlaylistItems).where(eq(broadcastPlaylistItems.id, id)).limit(1);
  return (row as BroadcastPlaylistItemRecord) ?? null;
}

// `url` só entra no SET quando fornecido (item "webpage") — pra local/media-asset/news, omitir a
// chave preserva o null que o CHECK de forma no schema exige; nunca sobrescreve com um valor
// vindo de outro tipo de item por engano.
export async function applyPlaylistItemUpdate(input: {
  id: string;
  title: string | null;
  durationSeconds: number | null;
  url?: string;
  withAudio?: boolean;
  visibleFrom?: Date | null;
  visibleUntil?: Date | null;
}): Promise<BroadcastPlaylistItemRecord> {
  const [row] = await db
    .update(broadcastPlaylistItems)
    .set({
      title: input.title,
      durationSeconds: input.durationSeconds,
      ...(input.url !== undefined ? { url: input.url } : {}),
      ...(input.withAudio !== undefined ? { withAudio: input.withAudio } : {}),
      ...(input.visibleFrom !== undefined ? { visibleFrom: input.visibleFrom } : {}),
      ...(input.visibleUntil !== undefined ? { visibleUntil: input.visibleUntil } : {}),
      updatedAt: sql`now()`,
    })
    .where(eq(broadcastPlaylistItems.id, input.id))
    .returning();
  return row as BroadcastPlaylistItemRecord;
}
