import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { findAllOutputTokens } from "../../../shared/output-tokens";
import { insertAlert } from "./store";
import type { PublishAlertCommand, PublishAlertResult } from "./types";

export async function publishAlert(command: PublishAlertCommand): Promise<PublishAlertResult> {
  const handle = beginOperation({
    useCase: "broadcast.publish-alert",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const expiresAt = new Date(Date.now() + command.durationSeconds * 1000);
  const record = await insertAlert({ message: command.message.trim(), target: command.target ?? null, expiresAt });

  endOperation(handle, { success: true });

  // Alerta é global — empurra o evento pra todas as saídas pra cada TV rebuscar o estado em ~1s,
  // em vez de esperar o poll de segurança de 15s (FALLBACK_POLL_MS em output-canvas.tsx).
  const tokens = await findAllOutputTokens();
  for (const token of tokens) publishOutputEvent(token, { type: "alert-changed" });

  return { success: true, data: record };
}
