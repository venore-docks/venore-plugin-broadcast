import { isValidScheduleSlot } from "../../../shared/playlist-schedule";
import type { SetOutputPlaylistScheduleInput } from "./types";

export function validateSetOutputPlaylistScheduleInput(
  input: SetOutputPlaylistScheduleInput,
): { code: string; message: string } | null {
  if (!input.outputId) {
    return { code: "broadcast.set-output-playlist-schedule.invalid_output", message: "Tela inválida." };
  }
  if (!Array.isArray(input.slots)) {
    return { code: "broadcast.set-output-playlist-schedule.invalid_slots", message: "Programação inválida." };
  }
  for (const slot of input.slots) {
    if (!slot.playlistId) {
      return {
        code: "broadcast.set-output-playlist-schedule.slot_missing_playlist",
        message: "Cada faixa de horário precisa de uma playlist.",
      };
    }
    if (!isValidScheduleSlot(slot)) {
      return {
        code: "broadcast.set-output-playlist-schedule.slot_invalid_window",
        message: "Cada faixa precisa de pelo menos um dia e de um horário de fim depois do início (sem cruzar a meia-noite).",
      };
    }
  }
  return null;
}
