import { stat } from "node:fs/promises";
import path from "node:path";
import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { computeFileSha256 } from "../../../shared/file-integrity";
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

  // Hasheado aqui (mesmo racional de add-scanned-playlist-items/service.ts) — este É o momento em
  // que o item de fato é publicado, seja na hora ou na aprovação de uma pendência (ver features/
  // content-changes). Reconfere que o arquivo ainda existe: se a aprovação demorou e alguém apagou
  // o arquivo nesse meio-tempo, falha aqui em vez de criar um item apontando pro nada.
  const absolutePath = resolveWithinRoot(BROADCAST_ROOT_FOLDER, command.relativePath);
  if (!absolutePath) {
    return {
      success: false,
      error: { code: "broadcast.upload-local-video.invalid_path", message: "O arquivo enviado é inválido." },
    };
  }
  let fileSizeBytes: number;
  let fileSha256: string;
  try {
    const info = await stat(absolutePath);
    fileSizeBytes = info.size;
    fileSha256 = await computeFileSha256(absolutePath);
  } catch {
    return {
      success: false,
      error: { code: "broadcast.upload-local-video.file_missing", message: "O arquivo enviado não está mais no servidor." },
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
    fileSizeBytes,
    fileSha256,
  });

  endOperation(handle, { success: true });
  return { success: true, data: item };
}
