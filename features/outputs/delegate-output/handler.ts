import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { delegateOutput } from "./service";
import type { DelegateOutputInput, DelegateOutputResult } from "./types";

// Só broadcast.manage (Admin do Estúdio) delega — decisão explícita: "qualquer Admin do Estúdio",
// não mais só Superadmin. Mesmo gate dos set-*-editors. Sem sub-delegação (um responsável de
// escopo NÃO delega adiante).
export async function delegateOutputHandler(input: DelegateOutputInput): Promise<DelegateOutputResult> {
  if (!input.outputId || !input.userId) {
    return { success: false, error: { code: "broadcast.delegate-output.invalid_input", message: "Tela e pessoa são obrigatórias." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return delegateOutput({ ...input, actorId: authz.actorId });
}
