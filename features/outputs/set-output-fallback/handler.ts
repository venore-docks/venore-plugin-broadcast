import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputFallback } from "./service";
import type { SetOutputFallbackInput, SetOutputFallbackResult } from "./types";

export async function setOutputFallbackHandler(input: SetOutputFallbackInput): Promise<SetOutputFallbackResult> {
  if (!input.outputId) {
    return { success: false, error: { code: "broadcast.set-output-fallback.invalid_input", message: "Tela é obrigatória." } };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputFallback({ ...input, actorId: authz.actorId });
}
