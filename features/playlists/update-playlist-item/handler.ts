import { authorizePlaylistItemActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { updatePlaylistItem } from "./service";
import { findPlaylistItemById } from "./store";
import { validateUpdatePlaylistItemInput } from "./validation";
import type { UpdatePlaylistItemInput } from "./types";

// Gateado (v1.9, features/content-changes): quem só tem broadcast.playlists.manage (+ atribuição)
// não aplica na hora — a mudança fica pending até um broadcast.manage aprovar. Ver o desenho salvo
// em memória (broadcast-studio-roadmap) pra o racional completo.
export async function updatePlaylistItemHandler(
  input: UpdatePlaylistItemInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord>> {
  const validationError = validateUpdatePlaylistItemInput(input);
  if (validationError) {
    return { success: false, pending: false, error: validationError };
  }

  const authz = await authorizePlaylistItemActor(input.itemId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.updatePlaylistItem,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    targetId: input.itemId,
    playlistId: authz.playlistId,
    payload: { ...input },
    fetchPreviousSnapshot: () => findPlaylistItemById(input.itemId),
    apply: (payload) => updatePlaylistItem({ ...(payload as UpdatePlaylistItemInput), actorId: authz.actorId }),
  });
}
