import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { rejectContentChange } from "./service";
import type { RejectContentChangeInput, RejectContentChangeResult } from "./types";

export async function rejectContentChangeHandler(input: RejectContentChangeInput): Promise<RejectContentChangeResult> {
  if (!input.changeId) {
    return { success: false, error: { code: "broadcast.reject-content-change.invalid_change", message: "Alteração inválida." } };
  }
  if (!input.reason?.trim()) {
    return { success: false, error: { code: "broadcast.reject-content-change.missing_reason", message: "Informe o motivo da rejeição." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return rejectContentChange({ changeId: input.changeId, reason: input.reason.trim(), actorId: authz.actorId });
}
