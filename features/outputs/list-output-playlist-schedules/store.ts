import { asc } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputPlaylistSchedule } from "../../../database/schema";
import type { BroadcastPlaylistScheduleSlot } from "../../../contracts/types";

export async function findAllOutputPlaylistScheduleSlots(): Promise<BroadcastPlaylistScheduleSlot[]> {
  const rows = await db
    .select()
    .from(broadcastOutputPlaylistSchedule)
    .orderBy(asc(broadcastOutputPlaylistSchedule.startMinute), asc(broadcastOutputPlaylistSchedule.createdAt));
  return rows.map((row) => ({
    id: row.id,
    outputId: row.outputId,
    playlistId: row.playlistId,
    days: row.days,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
  }));
}
