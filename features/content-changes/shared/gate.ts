import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastContentChangeEntityType } from "../../../contracts/types";
import { inferTargetId } from "./infer-target-id";
import { findPendingContentChangeForTarget, insertContentChange } from "./store";

// Resultado de uma mutação gateada (features/content-changes) — três formas: aplicada na hora
// (pending:false, mesma forma de OperationResult<T>), enfileirada aguardando aprovação
// (pending:true, sem data ainda — ninguém aplicou nada de verdade), ou recusada antes mesmo de
// enfileirar (ex: já existe uma pendência pro mesmo alvo). Handlers das 9 mutações gateadas
// (playlist item x6 + alertas/takeover) devolvem isto no lugar do antigo OperationResult<T> puro.
export type GatedMutationResult<T> = ({ pending: false } & OperationResult<T>) | { success: true; pending: true; changeId: string };

// Ponto único que decide "aplica na hora" (isFullAccess) vs "enfileira até um broadcast.manage
// aprovar" — chamado do handler.ts de cada uma das 9 mutações gateadas (nunca do service.ts, que
// continua puro/reutilizável tanto aqui quanto em approve-content-change). `apply` É o service.ts
// de sempre — nada de lógica de escrita duplicada aqui.
export async function runGatedMutation<T>(params: {
  useCase: string;
  entityType: BroadcastContentChangeEntityType;
  isFullAccess: boolean;
  actorId: string;
  targetId: string | null;
  playlistId: string | null;
  payload: Record<string, unknown>;
  // Estado ANTES de aplicar (pra log/diff) — undefined quando a ação é uma criação (nada existia
  // antes). Resolvido tanto no caminho imediato quanto no enfileirado, pro log ficar uniforme
  // independente de quem está mutando.
  fetchPreviousSnapshot?: () => Promise<unknown>;
  apply: (payload: Record<string, unknown>) => Promise<OperationResult<T>>;
}): Promise<GatedMutationResult<T>> {
  const { useCase, entityType, isFullAccess, actorId, targetId, playlistId, payload, fetchPreviousSnapshot, apply } = params;

  if (isFullAccess) {
    const previousSnapshot = (await fetchPreviousSnapshot?.()) ?? null;
    const result = await apply(payload);
    if (result.success) {
      await insertContentChange({
        useCase,
        entityType,
        targetId: targetId ?? inferTargetId(result.data),
        playlistId,
        payload,
        previousSnapshot,
        resultSnapshot: result.data,
        status: "auto_approved",
        requestedBy: actorId,
        decidedBy: actorId,
        decidedAt: new Date(),
      });
    }
    return { ...result, pending: false };
  }

  if (targetId) {
    const existing = await findPendingContentChangeForTarget(targetId, useCase);
    if (existing) {
      return {
        success: false,
        pending: false,
        error: {
          code: "broadcast.content-changes.already_pending",
          message: "Já existe uma alteração aguardando aprovação para este item — espere a decisão antes de propor outra.",
        },
      };
    }
  }

  const previousSnapshot = (await fetchPreviousSnapshot?.()) ?? null;
  const change = await insertContentChange({
    useCase,
    entityType,
    targetId,
    playlistId,
    payload,
    previousSnapshot,
    resultSnapshot: null,
    status: "pending",
    requestedBy: actorId,
    decidedBy: null,
    decidedAt: null,
  });
  return { success: true, pending: true, changeId: change.id };
}
