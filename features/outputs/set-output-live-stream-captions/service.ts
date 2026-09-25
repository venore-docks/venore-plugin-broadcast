import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { applyOutputLiveStreamCaptions, findOutputById } from "./store";
import type { SetOutputLiveStreamCaptionsCommand, SetOutputLiveStreamCaptionsResult } from "./types";

export async function setOutputLiveStreamCaptions(
  command: SetOutputLiveStreamCaptionsCommand,
): Promise<SetOutputLiveStreamCaptionsResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return {
      success: false,
      error: { code: "broadcast.set-output-live-stream-captions.not_found", message: "Tela não encontrada." },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-output-live-stream-captions",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyOutputLiveStreamCaptions(command.outputId, command.captions);

  endOperation(handle, { success: true });
  // A TV rebusca o estado (evento != "state") e troca a legenda sem recarregar a transmissão.
  publishOutputEvent(output.token, { type: "live-stream-captions-changed", captions: command.captions });
  return { success: true, data: record };
}
