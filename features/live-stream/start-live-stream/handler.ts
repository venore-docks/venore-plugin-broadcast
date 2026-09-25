import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { startLiveStream } from "./service";
import { validateStartLiveStreamInput } from "./validation";
import type { StartLiveStreamInput, StartLiveStreamResult } from "./types";

// Só broadcast.manage (mesmo nível de takeover/aviso rápido — é conteúdo externo cobrindo a tela
// inteira). Fora do fluxo de aprovação (features/content-changes) de propósito: quem chama já é o
// nível que aprova, mesmo racional de clear-takeover; o registro de auditoria fica no
// beginOperation do service.
export async function startLiveStreamHandler(input: StartLiveStreamInput): Promise<StartLiveStreamResult> {
  const validationError = validateStartLiveStreamInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return startLiveStream({ ...input, actorId: authz.actorId });
}
