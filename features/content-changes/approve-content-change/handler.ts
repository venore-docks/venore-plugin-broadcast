import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { approveContentChange } from "./service";
import type { ApproveContentChangeInput, ApproveContentChangeResult } from "./types";

// Só quem tem broadcast.manage aprova — é a mesma permission que, na origem (shared/scoped-
// authorization), autoriza aplicar direto sem passar pela fila.
export async function approveContentChangeHandler(input: ApproveContentChangeInput): Promise<ApproveContentChangeResult> {
  if (!input.changeId) {
    return { success: false, error: { code: "broadcast.approve-content-change.invalid_change", message: "Alteração inválida." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return approveContentChange({ ...input, actorId: authz.actorId });
}
