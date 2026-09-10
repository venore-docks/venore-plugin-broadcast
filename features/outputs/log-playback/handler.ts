import { findOutputIdByToken, insertPlaybackLog } from "./store";
import type { LogPlaybackInput, LogPlaybackResult } from "./types";

// Sem authorizeActor — acesso por token (chamado pela rota do beacon), mesmo espírito de
// getOutputState / resolveStreamableItem. Best-effort: qualquer problema devolve success:false em
// silêncio, a rota do beacon ignora (não bloqueia o 204).
export async function logPlaybackHandler(input: LogPlaybackInput): Promise<LogPlaybackResult> {
  if (!input.token || !input.playlistItemId || !input.itemLabel) {
    return { success: false, error: { code: "broadcast.log-playback.invalid_input", message: "Dados incompletos." } };
  }

  const outputId = await findOutputIdByToken(input.token);
  if (!outputId) {
    return { success: false, error: { code: "broadcast.log-playback.output_not_found", message: "Tela não encontrada." } };
  }

  await insertPlaybackLog({ outputId, playlistItemId: input.playlistItemId, itemLabel: input.itemLabel.slice(0, 300) });
  return { success: true, data: null };
}
