import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { applyOutputFallback, findOutputById } from "./store";
import type { SetOutputFallbackCommand, SetOutputFallbackResult } from "./types";

export async function setOutputFallback(command: SetOutputFallbackCommand): Promise<SetOutputFallbackResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.set-output-fallback.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-output-fallback",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyOutputFallback(command.outputId, {
    mediaAssetId: command.mediaAssetId,
    message: command.message === undefined ? undefined : command.message?.trim() || null,
  });

  endOperation(handle, { success: true });
  publishOutputEvent(output.token, { type: "settings-changed" });
  return { success: true, data: record };
}
