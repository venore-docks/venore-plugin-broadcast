import { authorizePlaylistItemActor } from "../../../shared/scoped-authorization";
// findPlaylistItemById é de update-playlist-item/store, não desta feature — reuso deliberado (é a
// mesma tabela/linha, não faz sentido duplicar a query só pra manter a pasta "pura"); precisa do
// estado ANTES de apagar pra gravar em previousSnapshot (o "o que tirou" do log de auditoria).
import { findPlaylistItemById } from "../update-playlist-item/store";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import { deletePlaylistItem } from "./service";
import type { DeletePlaylistItemInput } from "./types";

export async function deletePlaylistItemHandler(input: DeletePlaylistItemInput): Promise<GatedMutationResult<{ id: string }>> {
  const authz = await authorizePlaylistItemActor(input.itemId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.deletePlaylistItem,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    targetId: input.itemId,
    playlistId: authz.playlistId,
    payload: { itemId: input.itemId },
    fetchPreviousSnapshot: () => findPlaylistItemById(input.itemId),
    apply: (payload) => deletePlaylistItem(payload as DeletePlaylistItemInput),
  });
}
