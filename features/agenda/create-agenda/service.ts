import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { findMaxAgendaOrder, insertAgenda } from "./store";
import type { CreateAgendaCommand, CreateAgendaResult } from "./types";

export async function createAgenda(command: CreateAgendaCommand): Promise<CreateAgendaResult> {
  const handle = beginOperation({
    useCase: "broadcast.create-agenda",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const nextOrder = (await findMaxAgendaOrder()) + 1;
  const record = await insertAgenda({
    name: command.name.trim(),
    displaySeconds: command.displaySeconds ?? 20,
    order: nextOrder,
    backgroundColor: command.backgroundColor?.trim() || null,
    logoMediaAssetId: command.logoMediaAssetId?.trim() || null,
    calendariosSectorSlug: command.calendariosSectorSlug?.trim() || null,
  });

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
