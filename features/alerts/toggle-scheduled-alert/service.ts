import { applyScheduledAlertEnabled } from "./store";
import type { ToggleScheduledAlertInput, ToggleScheduledAlertResult } from "./types";

export async function toggleScheduledAlert(input: ToggleScheduledAlertInput): Promise<ToggleScheduledAlertResult> {
  const record = await applyScheduledAlertEnabled(input.id, input.enabled);
  if (!record) {
    return { success: false, error: { code: "broadcast.toggle-scheduled-alert.not_found", message: "Aviso agendado não encontrado." } };
  }
  return { success: true, data: record };
}
