import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputLiveStreamCaptions } from "./service";
import type { SetOutputLiveStreamCaptionsInput, SetOutputLiveStreamCaptionsResult } from "./types";

export async function setOutputLiveStreamCaptionsHandler(
  input: SetOutputLiveStreamCaptionsInput,
): Promise<SetOutputLiveStreamCaptionsResult> {
  if (!input.outputId) {
    return {
      success: false,
      error: { code: "broadcast.set-output-live-stream-captions.invalid_input", message: "Tela é obrigatória." },
    };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputLiveStreamCaptions({ ...input, actorId: authz.actorId });
}
