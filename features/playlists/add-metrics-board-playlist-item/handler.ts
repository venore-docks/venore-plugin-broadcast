import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { addMetricsBoardPlaylistItem } from "./service";
import type { AddMetricsBoardPlaylistItemInput } from "./types";

export async function addMetricsBoardPlaylistItemHandler(
  input: AddMetricsBoardPlaylistItemInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord>> {
  if (!input.playlistId) {
    return {
      success: false,
      pending: false,
      error: { code: "broadcast.add-metrics-board-playlist-item.invalid_playlist", message: "Playlist inválida." },
    };
  }
  if (!input.boardToken || input.boardToken.trim().length === 0) {
    return {
      success: false,
      pending: false,
      error: { code: "broadcast.add-metrics-board-playlist-item.invalid_board", message: "Escolha um painel de métricas." },
    };
  }
  if (input.durationSeconds !== undefined && input.durationSeconds !== null && !(input.durationSeconds > 0)) {
    return {
      success: false,
      pending: false,
      error: {
        code: "broadcast.add-metrics-board-playlist-item.invalid_duration",
        message: "A duração precisa ser um número maior que zero.",
      },
    };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.addMetricsBoardPlaylistItem,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    targetId: null,
    playlistId: input.playlistId,
    payload: { ...input },
    apply: (payload) => addMetricsBoardPlaylistItem({ ...(payload as AddMetricsBoardPlaylistItemInput), actorId: authz.actorId }),
  });
}
