import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputFrozen } from "./service";
import type { SetOutputFrozenInput, SetOutputFrozenResult } from "./types";

export async function setOutputFrozenHandler(input: SetOutputFrozenInput): Promise<SetOutputFrozenResult> {
  if (!input.outputId) {
    return { success: false, error: { code: "broadcast.set-output-frozen.invalid_input", message: "Tela é obrigatória." } };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputFrozen({ ...input, actorId: authz.actorId });
}
