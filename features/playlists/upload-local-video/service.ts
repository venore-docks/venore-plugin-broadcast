import path from "node:path";
import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { BROADCAST_ROOT_FOLDER } from "../../../shared/settings";
import { normalizePlaylistFolderPath, resolveWithinRoot } from "../../../shared/sandboxed-path";
import { isVideoExtension } from "../../../shared/video-extensions";
import { findMaxPlaylistItemOrder, findPlaylistById, insertLocalPlaylistItem } from "./store";
import type { UploadLocalVideoCommand, UploadLocalVideoResult } from "./types";

export async function uploadLocalVideo(command: UploadLocalVideoCommand): Promise<UploadLocalVideoResult> {
  const playlist = await findPlaylistById(command.playlistId);
  if (!playlist || !playlist.folderPath) {
    return {
      success: false,
      error: { code: "broadcast.upload-local-video.invalid_playlist", message: "Playlist inválida." },
    };
  }

  // Defesa em profundidade — o arquivo já foi gravado pela rota, mas reconfere que o relativePath
  // resultante está dentro da pasta desta playlist, tem extensão de vídeo, e resolve dentro da raiz
  // (mesmo espírito de add-scanned-playlist-items).
  const normalizedFolderPath = normalizePlaylistFolderPath(playlist.folderPath);
  const withinPlaylistFolder =
    command.relativePath === normalizedFolderPath || command.relativePath.startsWith(`${normalizedFolderPath}/`);
  if (
    !withinPlaylistFolder ||
    !isVideoExtension(path.extname(command.relativePath)) ||
    !resolveWithinRoot(BROADCAST_ROOT_FOLDER, command.relativePath)
  ) {
    return {
      success: false,
      error: { code: "broadcast.upload-local-video.invalid_path", message: "O arquivo enviado é inválido." },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.upload-local-video",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const order = (await findMaxPlaylistItemOrder(command.playlistId)) + 1;
  const item = await insertLocalPlaylistItem({
    playlistId: command.playlistId,
    order,
    title: command.title,
    relativePath: command.relativePath,
  });

  endOperation(handle, { success: true });
  return { success: true, data: item };
}
