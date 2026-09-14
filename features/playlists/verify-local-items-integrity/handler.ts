import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { verifyLocalItemsIntegrity } from "./service";
import type { VerifyLocalItemsIntegrityResult } from "./types";

// Só broadcast.manage — é uma auditoria de segurança cruzando TODAS as playlists (não filtra por
// atribuição), diferente do resto das mutações de playlist que um responsável escopado também
// pode fazer.
export async function verifyLocalItemsIntegrityHandler(): Promise<VerifyLocalItemsIntegrityResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return verifyLocalItemsIntegrity();
}
