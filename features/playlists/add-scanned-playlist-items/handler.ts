import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { addScannedPlaylistItems } from "./service";
import { validateAddScannedPlaylistItemsInput } from "./validation";
import type { AddScannedPlaylistItemsInput } from "./types";

export async function addScannedPlaylistItemsHandler(
  input: AddScannedPlaylistItemsInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord[]>> {
  const validationError = validateAddScannedPlaylistItemsInput(input);
  if (validationError) {
    return { success: false, pending: false, error: validationError };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.addScannedPlaylistItems,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    // targetId null: pode inserir vários itens de uma vez (todo o resultado de um scan de pasta) —
    // não há um único alvo.
    targetId: null,
    playlistId: input.playlistId,
    payload: { ...input },
    apply: (payload) => addScannedPlaylistItems({ ...(payload as AddScannedPlaylistItemsInput), actorId: authz.actorId }),
  });
}
