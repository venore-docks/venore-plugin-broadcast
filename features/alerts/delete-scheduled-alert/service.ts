import { deleteScheduledAlertById } from "./store";
import type { DeleteScheduledAlertInput, DeleteScheduledAlertResult } from "./types";

export async function deleteScheduledAlert(input: DeleteScheduledAlertInput): Promise<DeleteScheduledAlertResult> {
  const deleted = await deleteScheduledAlertById(input.id);
  if (!deleted) {
    return { success: false, error: { code: "broadcast.delete-scheduled-alert.not_found", message: "Aviso agendado não encontrado." } };
  }
  return { success: true, data: { id: input.id } };
}
