import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaylists } from "../../../database/schema";
import type { BroadcastPlaylistRecord } from "../../../contracts/types";
import type { BroadcastPlaylistSlideshow } from "../../../shared/slideshow";

export async function findPlaylistById(id: string): Promise<BroadcastPlaylistRecord | null> {
  const [row] = await db.select().from(broadcastPlaylists).where(eq(broadcastPlaylists.id, id)).limit(1);
  return (row as BroadcastPlaylistRecord) ?? null;
}

export async function applyPlaylistSlideshow(id: string, slideshow: BroadcastPlaylistSlideshow): Promise<BroadcastPlaylistRecord> {
  const [row] = await db
    .update(broadcastPlaylists)
    .set({
      slideshowMotion: slideshow.motion,
      slideshowMotionStrength: slideshow.motionStrength,
      slideshowTransition: slideshow.transition,
      slideshowTransitionMs: slideshow.transitionMs,
      updatedAt: sql`now()`,
    })
    .where(eq(broadcastPlaylists.id, id))
    .returning();
  return row as BroadcastPlaylistRecord;
}
