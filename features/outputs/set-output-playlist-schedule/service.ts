import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { findOutputById, replaceOutputPlaylistSchedule } from "./store";
import type { SetOutputPlaylistScheduleCommand, SetOutputPlaylistScheduleResult } from "./types";

export async function setOutputPlaylistSchedule(
  command: SetOutputPlaylistScheduleCommand,
): Promise<SetOutputPlaylistScheduleResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return {
      success: false,
      error: { code: "broadcast.set-output-playlist-schedule.not_found", message: "Tela não encontrada." },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-output-playlist-schedule",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  await replaceOutputPlaylistSchedule(command.outputId, command.slots);

  endOperation(handle, { success: true });
  // A TV reavalia qual playlist toca no próximo estado — "playlist-changed" força o refetch (sem
  // payload, ver contracts/types.ts). Publicado só pro token desta saída.
  publishOutputEvent(output.token, { type: "playlist-changed" });

  return { success: true, data: { outputId: command.outputId, slots: command.slots } };
}
