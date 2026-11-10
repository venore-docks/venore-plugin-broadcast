import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { applyPlaylistSlideshow, findPlaylistById } from "./store";
import type { SetPlaylistSlideshowCommand, SetPlaylistSlideshowResult } from "./types";

// Estilo do slideshow é aparência (movimento/transição das imagens que a playlist já tem), não
// conteúdo novo — por isso NÃO passa pelo fluxo de aprovação (features/content-changes), mesmo
// racional de nome/cor/grupo de tela serem imediatos. As TVs pegam o estilo novo no próximo
// refetch de estado (poll de 15s, igual a qualquer edição de playlist).
export async function setPlaylistSlideshow(command: SetPlaylistSlideshowCommand): Promise<SetPlaylistSlideshowResult> {
  const playlist = await findPlaylistById(command.playlistId);
  if (!playlist) {
    return {
      success: false,
      error: { code: "broadcast.set-playlist-slideshow.not_found", message: "Playlist não encontrada." },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-playlist-slideshow",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyPlaylistSlideshow(command.playlistId, command.slideshow);

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
