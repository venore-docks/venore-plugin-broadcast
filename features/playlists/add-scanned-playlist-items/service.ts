import { stat } from "node:fs/promises";
import path from "node:path";
import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { computeFileSha256 } from "../../../shared/file-integrity";
import { BROADCAST_IMAGES_FOLDER_PATH, BROADCAST_ROOT_FOLDER } from "../../../shared/settings";
import { normalizePlaylistFolderPath, resolveWithinRoot } from "../../../shared/sandboxed-path";
import { isImageExtension, isVideoExtension } from "../../../shared/video-extensions";
import { findMaxPlaylistItemOrder, findPlaylistById, insertLocalPlaylistItems } from "./store";
import type { AddScannedPlaylistItemsCommand, AddScannedPlaylistItemsResult } from "./types";

// Nunca confia cegamente na lista de relativePath vinda do client, mesmo tendo saído de um scan
// (scan-playlist-folder) recente — reconfere que cada um: está dentro da pasta certa pro `kind`
// (não só da raiz), tem extensão válida pro `kind`, e o arquivo ainda existe no disco (pode ter
// sumido entre o scan e a confirmação). Mesma defesa em profundidade de
// resolve-streamable-playlist-item.
//
// kind="video" continua lendo playlist.folderPath (sempre BROADCAST_VIDEOS_FOLDER_PATH hoje);
// kind="image" usa BROADCAST_IMAGES_FOLDER_PATH direto, independente dessa coluna — mesmo racional
// de scan-playlist-folder/service.ts.
export async function addScannedPlaylistItems(command: AddScannedPlaylistItemsCommand): Promise<AddScannedPlaylistItemsResult> {
  const playlist = await findPlaylistById(command.playlistId);
  const folderPath = command.kind === "video" ? playlist?.folderPath : BROADCAST_IMAGES_FOLDER_PATH;
  if (!playlist || !folderPath) {
    return {
      success: false,
      error: { code: "broadcast.add-scanned-playlist-items.invalid_playlist", message: "Playlist inválida." },
    };
  }

  // normalizePlaylistFolderPath também aqui (não só em create-playlist) — defesa em profundidade
  // pra uma playlist com folderPath salvo antes do fix (barra sobrando) continuar funcionando sem
  // precisar de migração manual.
  const normalizedFolderPath = normalizePlaylistFolderPath(folderPath);
  const matchesExtension = command.kind === "video" ? isVideoExtension : isImageExtension;
  // Hasheado aqui (não só validado com stat()) — este É o momento "de aprovação" pro item: quando
  // isto roda de verdade, seja na hora (broadcast.manage) ou na aprovação de uma pendência (ver
  // features/content-changes), o hash grava o QUE FOI PUBLICADO, contra o qual a verificação
  // periódica (verify-local-items-integrity) compara depois. Sequencial de propósito — ler vários
  // vídeos grandes em paralelo compete por I/O sem ganho real.
  const validItems: { relativePath: string; fileSizeBytes: number; fileSha256: string }[] = [];
  for (const relativePath of command.relativePaths) {
    const withinTargetFolder = relativePath === normalizedFolderPath || relativePath.startsWith(`${normalizedFolderPath}/`);
    if (!withinTargetFolder || !matchesExtension(path.extname(relativePath))) continue;

    const absolutePath = resolveWithinRoot(BROADCAST_ROOT_FOLDER, relativePath);
    if (!absolutePath) continue;

    try {
      const info = await stat(absolutePath);
      if (!info.isFile()) continue;
      const fileSha256 = await computeFileSha256(absolutePath);
      validItems.push({ relativePath, fileSizeBytes: info.size, fileSha256 });
    } catch {
      // Arquivo sumiu entre o scan e a confirmação — ignora esse item, não falha a operação inteira.
    }
  }

  if (validItems.length === 0) {
    return {
      success: false,
      error: {
        code: "broadcast.add-scanned-playlist-items.no_valid_items",
        message: "Nenhum dos itens selecionados foi encontrado na pasta — tente escanear de novo.",
      },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.add-scanned-playlist-items",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  let nextOrder = (await findMaxPlaylistItemOrder(command.playlistId)) + 1;
  const items = await insertLocalPlaylistItems(
    validItems.map((item) => ({
      playlistId: command.playlistId,
      order: nextOrder++,
      title: null,
      relativePath: item.relativePath,
      fileSizeBytes: item.fileSizeBytes,
      fileSha256: item.fileSha256,
    })),
  );

  endOperation(handle, { success: true });
  return { success: true, data: items };
}
