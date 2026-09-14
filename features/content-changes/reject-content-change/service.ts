import { findContentChangeById, markContentChangeRejected } from "../shared/store";
import type { RejectContentChangeCommand, RejectContentChangeResult } from "./types";

// Rejeitar NÃO aplica nada — o payload fica só como registro histórico do que foi proposto e
// recusado. Exige motivo (checado na validação do handler): quem propôs precisa poder ver por que
// (features/content-changes/list-my-content-changes).
export async function rejectContentChange(command: RejectContentChangeCommand): Promise<RejectContentChangeResult> {
  const change = await findContentChangeById(command.changeId);
  if (!change) {
    return { success: false, error: { code: "broadcast.reject-content-change.not_found", message: "Alteração não encontrada." } };
  }
  if (change.status !== "pending") {
    return {
      success: false,
      error: { code: "broadcast.reject-content-change.not_pending", message: "Esta alteração já foi decidida." },
    };
  }

  await markContentChangeRejected(change.id, { decidedBy: command.actorId, reason: command.reason });
  return { success: true, data: { id: change.id } };
}
