import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { findOutputTokenById } from "./store";
import type { ReloadOutputCommand, ReloadOutputResult } from "./types";

export async function reloadOutput(command: ReloadOutputCommand): Promise<ReloadOutputResult> {
  const token = await findOutputTokenById(command.outputId);
  if (!token) {
    return { success: false, error: { code: "broadcast.reload-output.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.reload-output",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  publishOutputEvent(token, { type: "reload" });

  endOperation(handle, { success: true });
  return { success: true, data: { outputId: command.outputId } };
}
