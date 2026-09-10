import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { reloadOutput } from "./service";
import type { ReloadOutputInput, ReloadOutputResult } from "./types";

// Mesmo gate dos outros controles ao vivo de UMA tela (setOutputDrawer/setOutputFooter/…):
// broadcast.manage OU broadcast.outputs.manage + atribuição a esta tela.
export async function reloadOutputHandler(input: ReloadOutputInput): Promise<ReloadOutputResult> {
  if (!input.outputId) {
    return { success: false, error: { code: "broadcast.reload-output.invalid_input", message: "Tela é obrigatória." } };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return reloadOutput({ ...input, actorId: authz.actorId });
}
