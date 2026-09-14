import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { reorderPlaylistItemsService } from "./service";
import { findPlaylistItemsByPlaylistId } from "./store";
import type { ReorderPlaylistItemsInput } from "./types";

export async function reorderPlaylistItemsHandler(
  input: ReorderPlaylistItemsInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord[]>> {
  if (!input.playlistId) {
    return {
      success: false,
      pending: false,
      error: { code: "broadcast.reorder-playlist-items.invalid_playlist", message: "Playlist inválida." },
    };
  }
  if (input.itemIds.length === 0) {
    return {
      success: false,
      pending: false,
      error: { code: "broadcast.reorder-playlist-items.invalid_items", message: "Lista de itens não pode ser vazia." },
    };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.reorderPlaylistItems,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    // targetId null: reordenar afeta a playlist inteira, não um único item — playlistId já basta
    // pra localizar a mudança.
    targetId: null,
    playlistId: input.playlistId,
    payload: { ...input },
    fetchPreviousSnapshot: () => findPlaylistItemsByPlaylistId(input.playlistId),
    apply: (payload) => reorderPlaylistItemsService({ ...(payload as ReorderPlaylistItemsInput), actorId: authz.actorId }),
  });
}
