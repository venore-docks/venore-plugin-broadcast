import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { duplicateOutput } from "./service";
import type { DuplicateOutputInput, DuplicateOutputResult } from "./types";

// Só broadcast.manage — criar uma tela nova (mesmo sendo cópia) é ação de quem administra tudo,
// igual a createOutput.
export async function duplicateOutputHandler(input: DuplicateOutputInput): Promise<DuplicateOutputResult> {
  if (!input.outputId) {
    return { success: false, error: { code: "broadcast.duplicate-output.invalid_input", message: "Tela inválida." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return duplicateOutput({ ...input, actorId: authz.actorId });
}
