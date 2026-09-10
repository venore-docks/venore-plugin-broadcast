import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { applyOutputGroup, findOutputById } from "./store";
import type { SetOutputGroupCommand, SetOutputGroupResult } from "./types";

export async function setOutputGroup(command: SetOutputGroupCommand): Promise<SetOutputGroupResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.set-output-group.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-output-group",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyOutputGroup(command.outputId, command.groupName?.trim() || null);

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
