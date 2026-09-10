import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { findAllOutputTokens } from "../../../shared/output-tokens";
import { insertTakeover } from "./store";
import type { PublishTakeoverCommand, PublishTakeoverResult } from "./types";

export async function publishTakeover(command: PublishTakeoverCommand): Promise<PublishTakeoverResult> {
  const handle = beginOperation({
    useCase: "broadcast.publish-takeover",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const expiresAt = new Date(Date.now() + command.durationSeconds * 1000);
  const record = await insertTakeover({
    message: command.message.trim(),
    mediaAssetId: command.mediaAssetId,
    target: command.target ?? null,
    expiresAt,
  });

  endOperation(handle, { success: true });

  // Global — empurra pra todas as saídas pra cada TV rebuscar o estado em ~1s.
  const tokens = await findAllOutputTokens();
  for (const token of tokens) publishOutputEvent(token, { type: "takeover-changed" });

  return { success: true, data: record };
}
