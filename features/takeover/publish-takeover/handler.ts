import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastTakeoverRecord } from "../../../contracts/types";
import { publishTakeover } from "./service";
import { validatePublishTakeoverInput } from "./validation";
import type { PublishTakeoverInput } from "./types";

// Mesmo racional de publish-alert/handler.ts — isFullAccess sempre true hoje (só broadcast.manage
// chama), gateado só pra entrar no mesmo log de auditoria e já ficar pronto pra uma permission
// escopada futura.
export async function publishTakeoverHandler(input: PublishTakeoverInput): Promise<GatedMutationResult<BroadcastTakeoverRecord>> {
  const validationError = validatePublishTakeoverInput(input);
  if (validationError) {
    return { success: false, pending: false, error: validationError };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.publishTakeover,
    entityType: "takeover",
    isFullAccess: true,
    actorId: authz.actorId,
    targetId: null,
    playlistId: null,
    payload: { ...input },
    apply: (payload) => publishTakeover({ ...(payload as PublishTakeoverInput), actorId: authz.actorId }),
  });
}
