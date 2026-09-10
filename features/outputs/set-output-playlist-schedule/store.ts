import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputPlaylistSchedule, broadcastOutputs } from "../../../database/schema";
import type { BroadcastOutputRecord } from "../../../contracts/types";
import type { OutputPlaylistScheduleSlotInput } from "./types";

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

// Substitui o conjunto inteiro de slots de dayparting desta tela — mesmo padrão de
// replaceAgendaOutputLinks / replace*Editors. slots=[] é válido: "sem programação, sempre a
// playlist padrão da camada de vídeo".
export async function replaceOutputPlaylistSchedule(
  outputId: string,
  slots: OutputPlaylistScheduleSlotInput[],
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.delete(broadcastOutputPlaylistSchedule).where(eq(broadcastOutputPlaylistSchedule.outputId, outputId));
    if (slots.length > 0) {
      await tx.insert(broadcastOutputPlaylistSchedule).values(
        slots.map((slot) => ({
          outputId,
          playlistId: slot.playlistId,
          days: slot.days,
          startMinute: slot.startMinute,
          endMinute: slot.endMinute,
        })),
      );
    }
  });
}
