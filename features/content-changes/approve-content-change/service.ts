import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { CONTENT_CHANGE_APPLIERS } from "../shared/appliers";
import { inferTargetId } from "../shared/infer-target-id";
import { findContentChangeById, markContentChangeApproved, markContentChangeFailed } from "../shared/store";
import type { ApproveContentChangeCommand, ApproveContentChangeResult } from "./types";

// Reaplica o payload salvo chamando o MESMO service.ts que teria rodado na hora se quem propôs já
// tivesse broadcast.manage — o registry (shared/appliers.ts) é só um mapa useCase -> função, sem
// lógica de escrita própria aqui. Isso também resolve "aprovar 1h depois" de graça: ordem de item
// e expiresAt de alerta são recalculados no momento da aplicação de qualquer forma (ver comentário
// em shared/appliers.ts e no desenho salvo em memória).
export async function approveContentChange(command: ApproveContentChangeCommand): Promise<ApproveContentChangeResult> {
  const handle = beginOperation({
    useCase: "broadcast.approve-content-change",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const change = await findContentChangeById(command.changeId);
  if (!change) {
    const error = { code: "broadcast.approve-content-change.not_found", message: "Alteração não encontrada." };
    endOperation(handle, { success: false, error });
    return { success: false, error };
  }
  if (change.status !== "pending") {
    const error = { code: "broadcast.approve-content-change.not_pending", message: "Esta alteração já foi decidida." };
    endOperation(handle, { success: false, error });
    return { success: false, error };
  }

  const apply = CONTENT_CHANGE_APPLIERS[change.useCase];
  if (!apply) {
    const error = { code: "broadcast.approve-content-change.unknown_use_case", message: "Tipo de alteração desconhecido." };
    endOperation(handle, { success: false, error });
    return { success: false, error };
  }

  // Autor do conteúdo continua sendo quem propôs (requestedBy) — o aprovador vira decidedBy, não
  // actorId do resultado. actorId entra por último pra nunca ser pisado por um campo perdido no
  // payload salvo.
  const result = await apply({ ...(change.payload as Record<string, unknown>), actorId: change.requestedBy });

  if (!result.success) {
    // Alvo obsoleto (ex: item apagado por outra via enquanto a aprovação esperava) cai aqui —
    // status vira "failed" com o motivo, a fila não trava e nada se perde silenciosamente.
    await markContentChangeFailed(change.id, result.error.message);
    endOperation(handle, { success: false, error: result.error });
    return { success: false, error: result.error };
  }

  await markContentChangeApproved(change.id, {
    decidedBy: command.actorId,
    resultSnapshot: result.data,
    targetId: change.targetId ?? inferTargetId(result.data),
  });

  endOperation(handle, { success: true });
  return { success: true, data: { id: change.id } };
}
