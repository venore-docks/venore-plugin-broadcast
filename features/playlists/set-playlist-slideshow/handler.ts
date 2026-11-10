import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { parseSlideshowInput } from "../../../shared/slideshow";
import { setPlaylistSlideshow } from "./service";
import type { SetPlaylistSlideshowInput, SetPlaylistSlideshowResult } from "./types";

// broadcast.manage OU broadcast.playlists.manage + atribuído à playlist (mesmo escopo das demais
// edições de playlist). Não passa pelo gate de aprovação — ver service.ts.
export async function setPlaylistSlideshowHandler(input: SetPlaylistSlideshowInput): Promise<SetPlaylistSlideshowResult> {
  if (!input.playlistId) {
    return {
      success: false,
      error: { code: "broadcast.set-playlist-slideshow.invalid_input", message: "Playlist é obrigatória." },
    };
  }

  const parsed = parseSlideshowInput(input);
  if (!parsed.ok) {
    return {
      success: false,
      error: { code: `broadcast.set-playlist-slideshow.invalid_${parsed.error.field}`, message: parsed.error.message },
    };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setPlaylistSlideshow({ playlistId: input.playlistId, slideshow: parsed.value, actorId: authz.actorId });
}
