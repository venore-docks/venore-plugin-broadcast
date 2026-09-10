import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { duplicatePlaylistWithItems, findPlaylistById } from "./store";
import type { DuplicatePlaylistCommand, DuplicatePlaylistResult } from "./types";

export async function duplicatePlaylist(command: DuplicatePlaylistCommand): Promise<DuplicatePlaylistResult> {
  const source = await findPlaylistById(command.playlistId);
  if (!source) {
    return { success: false, error: { code: "broadcast.duplicate-playlist.not_found", message: "Playlist não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.duplicate-playlist",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const copy = await duplicatePlaylistWithItems(source);

  endOperation(handle, { success: true });
  return { success: true, data: copy };
}
