import type { BroadcastPlaylistScheduleSlot } from "../../../contracts/types";
import { findAllOutputPlaylistScheduleSlots } from "./store";
import type { ListOutputPlaylistSchedulesResult } from "./types";

export async function listOutputPlaylistSchedules(): Promise<ListOutputPlaylistSchedulesResult> {
  const slots = await findAllOutputPlaylistScheduleSlots();
  const byOutputId: Record<string, BroadcastPlaylistScheduleSlot[]> = {};
  for (const slot of slots) {
    (byOutputId[slot.outputId] ??= []).push(slot);
  }
  return { success: true, data: byOutputId };
}
