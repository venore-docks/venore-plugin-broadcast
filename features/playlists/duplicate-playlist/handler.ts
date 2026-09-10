import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { duplicatePlaylist } from "./service";
import type { DuplicatePlaylistInput, DuplicatePlaylistResult } from "./types";

// Só broadcast.manage — criar uma playlist nova (mesmo sendo cópia) é ação de quem administra tudo,
// igual a createPlaylist. Um "editor de playlist" edita as atribuídas, não cria novas.
export async function duplicatePlaylistHandler(input: DuplicatePlaylistInput): Promise<DuplicatePlaylistResult> {
  if (!input.playlistId) {
    return { success: false, error: { code: "broadcast.duplicate-playlist.invalid_input", message: "Playlist inválida." } };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return duplicatePlaylist({ ...input, actorId: authz.actorId });
}
