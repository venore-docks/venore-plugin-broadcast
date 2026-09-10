import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { applyPlaylistItemUpdate, findPlaylistItemById } from "./store";
import type { UpdatePlaylistItemCommand, UpdatePlaylistItemResult } from "./types";

export async function updatePlaylistItem(command: UpdatePlaylistItemCommand): Promise<UpdatePlaylistItemResult> {
  const handle = beginOperation({
    useCase: "broadcast.update-playlist-item",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const existing = await findPlaylistItemById(command.itemId);
  if (!existing) {
    const error = { code: "broadcast.update-playlist-item.not_found", message: "Item não encontrado." };
    endOperation(handle, { success: false, error });
    return { success: false, error };
  }

  const record = await applyPlaylistItemUpdate({
    id: command.itemId,
    title: command.title?.trim() || null,
    durationSeconds: command.durationSeconds ?? null,
    // Só reescreve url quando o item já é "webpage" — pra outros tipos, url continua null
    // (garantido pelo CHECK de forma no schema; não deixamos um valor perdido do form vazar aqui).
    url: existing.sourceType === "webpage" ? command.url?.trim() || existing.url || "" : undefined,
    withAudio: command.withAudio,
    // undefined = não mexe; Date|null = grava (null limpa a borda). Mesma convenção de url/withAudio.
    visibleFrom: command.visibleFrom,
    visibleUntil: command.visibleUntil,
  });

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
