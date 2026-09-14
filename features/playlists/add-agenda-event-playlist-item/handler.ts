import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { addAgendaEventPlaylistItem } from "./service";
import { validateAddAgendaEventPlaylistItemInput } from "./validation";
import type { AddAgendaEventPlaylistItemInput } from "./types";

export async function addAgendaEventPlaylistItemHandler(
  input: AddAgendaEventPlaylistItemInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord>> {
  const validationError = validateAddAgendaEventPlaylistItemInput(input);
  if (validationError) {
    return { success: false, pending: false, error: validationError };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.addAgendaEventPlaylistItem,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    targetId: null,
    playlistId: input.playlistId,
    payload: { ...input },
    apply: (payload) => addAgendaEventPlaylistItem({ ...(payload as AddAgendaEventPlaylistItemInput), actorId: authz.actorId }),
  });
}
