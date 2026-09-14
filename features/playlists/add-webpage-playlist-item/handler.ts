import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { addWebpagePlaylistItem } from "./service";
import { validateAddWebpagePlaylistItemInput } from "./validation";
import type { AddWebpagePlaylistItemInput } from "./types";

export async function addWebpagePlaylistItemHandler(
  input: AddWebpagePlaylistItemInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord>> {
  const validationError = validateAddWebpagePlaylistItemInput(input);
  if (validationError) {
    return { success: false, pending: false, error: validationError };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.addWebpagePlaylistItem,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    // targetId null: é uma criação, o id só existe depois de aplicado (o gate preenche sozinho a
    // partir do resultado — ver inferTargetId em shared/gate.ts).
    targetId: null,
    playlistId: input.playlistId,
    payload: { ...input },
    apply: (payload) => addWebpagePlaylistItem({ ...(payload as AddWebpagePlaylistItemInput), actorId: authz.actorId }),
  });
}
