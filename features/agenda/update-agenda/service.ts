import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { applyAgendaUpdate, findAgendaById } from "./store";
import type { UpdateAgendaCommand, UpdateAgendaResult } from "./types";

export async function updateAgenda(command: UpdateAgendaCommand): Promise<UpdateAgendaResult> {
  const handle = beginOperation({
    useCase: "broadcast.update-agenda",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const existing = await findAgendaById(command.agendaId);
  if (!existing) {
    const error = { code: "broadcast.update-agenda.not_found", message: "Agenda não encontrada." };
    endOperation(handle, { success: false, error });
    return { success: false, error };
  }

  const record = await applyAgendaUpdate({
    id: command.agendaId,
    name: command.name.trim(),
    displaySeconds: command.displaySeconds,
    backgroundColor: command.backgroundColor?.trim() || null,
    logoMediaAssetId: command.logoMediaAssetId?.trim() || null,
    calendariosSectorSlug: command.calendariosSectorSlug?.trim() || null,
  });

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
