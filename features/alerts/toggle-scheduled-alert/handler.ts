import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { toggleScheduledAlert } from "./service";
import type { ToggleScheduledAlertInput, ToggleScheduledAlertResult } from "./types";

export async function toggleScheduledAlertHandler(input: ToggleScheduledAlertInput): Promise<ToggleScheduledAlertResult> {
  if (!input.id) {
    return { success: false, error: { code: "broadcast.toggle-scheduled-alert.invalid_input", message: "Aviso inválido." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return toggleScheduledAlert(input);
}
