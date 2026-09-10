import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { findOutputById, rotateOutputToken } from "./store";
import type { RotateOutputTokenCommand, RotateOutputTokenResult } from "./types";

export async function rotateOutputTokenService(command: RotateOutputTokenCommand): Promise<RotateOutputTokenResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.rotate-output-token.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.rotate-output-token",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const token = await rotateOutputToken(command.outputId);

  endOperation(handle, { success: true });
  // As TVs presas no token ANTIGO recebem um reload — vão bater no 404 do link morto e cair na
  // tela de espera, em vez de continuar mostrando conteúdo velho.
  publishOutputEvent(output.token, { type: "reload" });

  return { success: true, data: { outputId: command.outputId, token } };
}
