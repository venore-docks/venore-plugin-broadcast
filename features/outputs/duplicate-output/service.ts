import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { duplicateOutputDeep, findOutputById } from "./store";
import type { DuplicateOutputCommand, DuplicateOutputResult } from "./types";

export async function duplicateOutput(command: DuplicateOutputCommand): Promise<DuplicateOutputResult> {
  const source = await findOutputById(command.outputId);
  if (!source) {
    return { success: false, error: { code: "broadcast.duplicate-output.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.duplicate-output",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const copy = await duplicateOutputDeep(source);

  endOperation(handle, { success: true });
  return { success: true, data: copy };
}
