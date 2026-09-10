import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputCardColor } from "./service";
import type { SetOutputCardColorInput, SetOutputCardColorResult } from "./types";

export async function setOutputCardColorHandler(input: SetOutputCardColorInput): Promise<SetOutputCardColorResult> {
  if (!input.outputId) {
    return {
      success: false,
      error: { code: "broadcast.set-output-card-color.invalid_input", message: "Tela é obrigatória." },
    };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputCardColor({ ...input, actorId: authz.actorId });
}
