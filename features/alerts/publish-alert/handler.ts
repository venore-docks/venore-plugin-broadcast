import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastAlertRecord } from "../../../contracts/types";
import { publishAlert } from "./service";
import { validatePublishAlertInput } from "./validation";
import type { PublishAlertInput } from "./types";

// Gateado (v1.9), mas hoje só broadcast.manage consegue chamar isto (não existe uma permission
// escopada pra alertas/takeover ainda) — isFullAccess é sempre true na prática, então a linha
// gravada é sempre auto_approved. Passa pelo mesmo runGatedMutation dos itens de playlist pra: (1)
// entrar no mesmo log de auditoria, e (2) já ficar pronto se um dia existir uma permission escopada
// tipo broadcast.alerts.manage.
export async function publishAlertHandler(input: PublishAlertInput): Promise<GatedMutationResult<BroadcastAlertRecord>> {
  const validationError = validatePublishAlertInput(input);
  if (validationError) {
    return { success: false, pending: false, error: validationError };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.publishAlert,
    entityType: "alert",
    isFullAccess: true,
    actorId: authz.actorId,
    targetId: null,
    playlistId: null,
    payload: { ...input },
    apply: (payload) => publishAlert({ ...(payload as PublishAlertInput), actorId: authz.actorId }),
  });
}
