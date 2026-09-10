import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { bulkOutputAction } from "./service";
import type { BulkOutputActionInput, BulkOutputActionResult } from "./types";

// Só broadcast.manage — ação em lote é de quem administra as telas por inteiro. Um responsável de
// escopo age tela a tela.
export async function bulkOutputActionHandler(input: BulkOutputActionInput): Promise<BulkOutputActionResult> {
  if (!input.groupName || (input.action !== "reload" && input.action !== "offline-on" && input.action !== "offline-off")) {
    return { success: false, error: { code: "broadcast.bulk-output-action.invalid_input", message: "Grupo e ação são obrigatórios." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return bulkOutputAction({ ...input, actorId: authz.actorId });
}
