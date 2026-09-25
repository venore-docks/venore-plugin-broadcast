import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { stopLiveStream } from "./service";
import type { StopLiveStreamInput, StopLiveStreamResult } from "./types";

export async function stopLiveStreamHandler(input: StopLiveStreamInput): Promise<StopLiveStreamResult> {
  if (!input.liveStreamId) {
    return { success: false, error: { code: "broadcast.stop-live-stream.invalid_input", message: "Transmissão é obrigatória." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return stopLiveStream({ ...input, actorId: authz.actorId });
}
