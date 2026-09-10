import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { rotateOutputTokenService } from "./service";
import type { RotateOutputTokenInput, RotateOutputTokenResult } from "./types";

// Mesmo gate dos outros controles de UMA tela — broadcast.manage OU broadcast.outputs.manage +
// atribuição a esta tela.
export async function rotateOutputTokenHandler(input: RotateOutputTokenInput): Promise<RotateOutputTokenResult> {
  if (!input.outputId) {
    return { success: false, error: { code: "broadcast.rotate-output-token.invalid_input", message: "Tela é obrigatória." } };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return rotateOutputTokenService({ ...input, actorId: authz.actorId });
}
