import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { clearLiveStreamFromOutputs, findOutputsOnLiveStream } from "./store";
import type { StopLiveStreamCommand, StopLiveStreamResult } from "./types";

export async function stopLiveStream(command: StopLiveStreamCommand): Promise<StopLiveStreamResult> {
  const outputs = await findOutputsOnLiveStream(command.liveStreamId, command.outputId);
  if (outputs.length === 0) {
    return {
      success: false,
      error: { code: "broadcast.stop-live-stream.not_found", message: "Essa transmissão já não está mais no ar nessa tela." },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.stop-live-stream",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  await clearLiveStreamFromOutputs(outputs.map((output) => output.id));

  endOperation(handle, { success: true });

  for (const output of outputs) publishOutputEvent(output.token, { type: "live-stream-changed" });

  return { success: true, data: { stopped: outputs.length } };
}
