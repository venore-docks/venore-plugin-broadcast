import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { rebaselineLocalItemIntegrity } from "./service";
import type { RebaselineLocalItemIntegrityInput, RebaselineLocalItemIntegrityResult } from "./types";

// Só broadcast.manage — mesmo racional de verify-local-items-integrity/handler.ts.
export async function rebaselineLocalItemIntegrityHandler(
  input: RebaselineLocalItemIntegrityInput,
): Promise<RebaselineLocalItemIntegrityResult> {
  if (!input.itemId) {
    return {
      success: false,
      error: { code: "broadcast.rebaseline-local-item-integrity.invalid_item", message: "Item inválido." },
    };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return rebaselineLocalItemIntegrity({ itemId: input.itemId, actorId: authz.actorId });
}
