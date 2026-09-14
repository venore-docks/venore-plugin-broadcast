import { authorizePlaylistItemActor } from "../../../shared/scoped-authorization";
// Mesmo racional de delete-playlist-item/handler.ts — reuso deliberado do reader de
// update-playlist-item/store.
import { findPlaylistItemById } from "../update-playlist-item/store";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { togglePlaylistItemVisibility } from "./service";
import type { TogglePlaylistItemVisibilityInput } from "./types";

export async function togglePlaylistItemVisibilityHandler(
  input: TogglePlaylistItemVisibilityInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord>> {
  const authz = await authorizePlaylistItemActor(input.itemId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.togglePlaylistItemVisibility,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    targetId: input.itemId,
    playlistId: authz.playlistId,
    payload: { ...input },
    fetchPreviousSnapshot: () => findPlaylistItemById(input.itemId),
    apply: (payload) => togglePlaylistItemVisibility(payload as TogglePlaylistItemVisibilityInput),
  });
}
