import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputGroup } from "./service";
import type { SetOutputGroupInput, SetOutputGroupResult } from "./types";

export async function setOutputGroupHandler(input: SetOutputGroupInput): Promise<SetOutputGroupResult> {
  if (!input.outputId) {
    return { success: false, error: { code: "broadcast.set-output-group.invalid_input", message: "Tela é obrigatória." } };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputGroup({ ...input, actorId: authz.actorId });
}
