import { findContentChangeById, markContentChangeCancelled } from "../shared/store";
import type { CancelContentChangeCommand, CancelContentChangeResult } from "./types";

// Só o próprio solicitante desiste da própria pendência — ou quem já tem broadcast.manage (pode
// destravar a fila de qualquer operador sem precisar aprovar/rejeitar formalmente). Cancelar não é
// uma decisão de aprovação: não grava decidedBy/decidedAt/rejectionReason.
export async function cancelContentChange(command: CancelContentChangeCommand): Promise<CancelContentChangeResult> {
  const change = await findContentChangeById(command.changeId);
  if (!change) {
    return { success: false, error: { code: "broadcast.cancel-content-change.not_found", message: "Alteração não encontrada." } };
  }
  if (change.status !== "pending") {
    return {
      success: false,
      error: { code: "broadcast.cancel-content-change.not_pending", message: "Esta alteração já foi decidida." },
    };
  }
  if (!command.isFullAccess && change.requestedBy !== command.actorId) {
    return {
      success: false,
      error: { code: "broadcast.cancel-content-change.forbidden", message: "Só quem propôs esta alteração pode cancelá-la." },
    };
  }

  await markContentChangeCancelled(change.id);
  return { success: true, data: { id: change.id } };
}
