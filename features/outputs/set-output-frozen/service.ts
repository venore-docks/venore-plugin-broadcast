import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { applyOutputFrozen, findOutputById } from "./store";
import type { SetOutputFrozenCommand, SetOutputFrozenResult } from "./types";

export async function setOutputFrozen(command: SetOutputFrozenCommand): Promise<SetOutputFrozenResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.set-output-frozen.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-output-frozen",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyOutputFrozen(command.outputId, command.frozen);

  endOperation(handle, { success: true });
  publishOutputEvent(output.token, { type: "frozen-changed", frozen: command.frozen });
  return { success: true, data: record };
}
