import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import {
  findAgendaIdsLinkedToOutput,
  findOutputById,
  findPlaylistIdsForOutput,
  grantOutputDelegation,
  revokeOutputDelegation,
} from "./store";
import type { DelegateOutputCommand, DelegateOutputResult } from "./types";

export async function delegateOutput(command: DelegateOutputCommand): Promise<DelegateOutputResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.delegate-output.not_found", message: "Tela não encontrada." } };
  }

  const [playlistIds, agendaIds] = await Promise.all([
    findPlaylistIdsForOutput(output),
    findAgendaIdsLinkedToOutput(command.outputId),
  ]);

  const handle = beginOperation({
    useCase: command.mode === "revoke" ? "broadcast.delegate-output.revoke" : "broadcast.delegate-output.grant",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  if (command.mode === "revoke") {
    await revokeOutputDelegation(command.outputId, playlistIds, agendaIds, command.userId);
  } else {
    await grantOutputDelegation(command.outputId, playlistIds, agendaIds, command.userId);
  }

  endOperation(handle, { success: true });
  return {
    success: true,
    data: { outputId: command.outputId, userId: command.userId, mode: command.mode, playlistIds, agendaIds },
  };
}
