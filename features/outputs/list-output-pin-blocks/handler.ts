import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listOutputPinBlocks } from "./service";
import type { ListOutputPinBlocksResult } from "./types";

// Só broadcast.manage — mesmo critério de list-connected-output-ips (visão de quem administra as
// telas por inteiro). Chamado pelo poll do admin em outputs-section.tsx.
export async function listOutputPinBlocksHandler(): Promise<ListOutputPinBlocksResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return listOutputPinBlocks();
}
