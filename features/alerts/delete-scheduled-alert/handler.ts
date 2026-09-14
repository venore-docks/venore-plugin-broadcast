import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { deleteScheduledAlert } from "./service";
import type { DeleteScheduledAlertInput, DeleteScheduledAlertResult } from "./types";

export async function deleteScheduledAlertHandler(input: DeleteScheduledAlertInput): Promise<DeleteScheduledAlertResult> {
  if (!input.id) {
    return { success: false, error: { code: "broadcast.delete-scheduled-alert.invalid_input", message: "Aviso inválido." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return deleteScheduledAlert(input);
}
