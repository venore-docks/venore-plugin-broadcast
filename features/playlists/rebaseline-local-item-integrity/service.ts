import { stat } from "node:fs/promises";
import { computeFileSha256 } from "../../../shared/file-integrity";
import { BROADCAST_ROOT_FOLDER } from "../../../shared/settings";
import { resolveWithinRoot } from "../../../shared/sandboxed-path";
import { findLocalItemById, updateItemFileIntegrity } from "./store";
import type { RebaselineLocalItemIntegrityCommand, RebaselineLocalItemIntegrityResult } from "./types";

// "Aceitar o arquivo atual" — depois de um admin confirmar que a mudança no arquivo era legítima
// (ex: substituiu por uma versão corrigida de propósito), regrava o hash/tamanho de referência a
// partir do arquivo REAL em disco agora. Não reaplica nenhuma mutação de conteúdo, só atualiza o
// "gabarito" contra o qual verify-local-items-integrity compara depois.
//
// Deliberadamente FORA do fluxo de aprovação de conteúdo (features/content-changes): é uma ação de
// auditoria/segurança sobre um item JÁ aprovado antes, não uma proposta de conteúdo novo — não faz
// sentido um operador escopado propor "aceitar este arquivo" pra outro broadcast.manage aprovar.
export async function rebaselineLocalItemIntegrity(
  command: RebaselineLocalItemIntegrityCommand,
): Promise<RebaselineLocalItemIntegrityResult> {
  const item = await findLocalItemById(command.itemId);
  if (!item || item.sourceType !== "local" || !item.relativePath) {
    return {
      success: false,
      error: { code: "broadcast.rebaseline-local-item-integrity.not_found", message: "Item não encontrado." },
    };
  }

  const absolutePath = resolveWithinRoot(BROADCAST_ROOT_FOLDER, item.relativePath);
  if (!absolutePath) {
    return {
      success: false,
      error: { code: "broadcast.rebaseline-local-item-integrity.invalid_path", message: "Caminho inválido." },
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
      error: { code: "broadcast.rebaseline-local-item-integrity.file_missing", message: "O arquivo não está mais no servidor." },
    };
  }

  await updateItemFileIntegrity(item.id, { fileSizeBytes, fileSha256 });
  return { success: true, data: { id: item.id, fileSizeBytes, fileSha256 } };
}
