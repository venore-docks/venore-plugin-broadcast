import { stat } from "node:fs/promises";
import { computeFileSha256 } from "../../../shared/file-integrity";
import { BROADCAST_ROOT_FOLDER } from "../../../shared/settings";
import { resolveWithinRoot } from "../../../shared/sandboxed-path";
import { findLocalItemsWithRecordedIntegrity } from "./store";
import type { LocalItemIntegrityIssue, VerifyLocalItemsIntegrityResult } from "./types";

// Varredura SOB DEMANDA — nunca automática num loader de página. Hashear vídeo é caro (lê o
// arquivo inteiro do disco); rodar isso a cada carregamento de admin seria I/O desnecessário pra
// uma checagem de segurança que não precisa ser em tempo real. Disparada por um botão
// ("Verificar integridade") em components/admin/playlists-section.tsx.
export async function verifyLocalItemsIntegrity(): Promise<VerifyLocalItemsIntegrityResult> {
  const rows = await findLocalItemsWithRecordedIntegrity();
  const issues: LocalItemIntegrityIssue[] = [];

  for (const row of rows) {
    const absolutePath = resolveWithinRoot(BROADCAST_ROOT_FOLDER, row.relativePath);
    if (!absolutePath) continue; // relativePath fora da raiz não deveria existir — defesa em profundidade só

    try {
      const info = await stat(absolutePath);
      const currentSha256 = await computeFileSha256(absolutePath);
      if (info.size !== row.fileSizeBytes || currentSha256 !== row.fileSha256) {
        issues.push({
          itemId: row.itemId,
          playlistId: row.playlistId,
          playlistName: row.playlistName,
          title: row.title,
          relativePath: row.relativePath,
          status: "mismatch",
          recordedSizeBytes: row.fileSizeBytes,
          currentSizeBytes: info.size,
        });
      }
    } catch {
      issues.push({
        itemId: row.itemId,
        playlistId: row.playlistId,
        playlistName: row.playlistName,
        title: row.title,
        relativePath: row.relativePath,
        status: "missing",
        recordedSizeBytes: row.fileSizeBytes,
        currentSizeBytes: null,
      });
    }
  }

  return { success: true, data: issues };
}
