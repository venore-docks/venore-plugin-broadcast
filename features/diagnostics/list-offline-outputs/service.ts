import { findOutputLastSeenRows } from "./store";
import type { ListOfflineOutputsResult } from "./types";

// Limiar pra "caiu" — deliberadamente mais folgado que o BROWSER_STALE_MS (60s) de get-output-
// diagnostics/service.ts: aquele é pra uma pessoa OLHANDO a página de diagnóstico em tempo real
// (tolerar 60s de silêncio já é suficiente ali). Este dispara uma notificação que interrompe quem
// está trabalhando — pedido explícito do usuário: "notificação quando uma tela cai por mais de X
// minutos" — então usa um limiar mais alto, pra não notificar por uma reconexão de rede de alguns
// segundos.
export const OFFLINE_AFTER_MS = 5 * 60_000;

// O heartbeat do browser da TV (output-canvas.tsx, a cada ~20s, sempre que a URL de saída está
// aberta — independente de alguém estar olhando o admin) é a fonte: browser_diagnostics.
// browser_reported_at. Uma saída que NUNCA reportou (browserReportedAt null) não entra aqui —
// "nunca foi aberta ainda" é um estado diferente de "estava online e caiu", e não deveria gerar
// notificação (senão toda tela recém-criada dispararia um aviso antes mesmo de alguém abrir a URL
// dela pela primeira vez).
export async function listOfflineOutputs(): Promise<ListOfflineOutputsResult> {
  const rows = await findOutputLastSeenRows();
  const now = Date.now();

  const offline = rows
    .filter((row): row is typeof row & { browserReportedAt: Date } => row.browserReportedAt !== null)
    .map((row) => ({ ...row, offlineForMs: now - row.browserReportedAt.getTime() }))
    .filter((row) => row.offlineForMs > OFFLINE_AFTER_MS)
    .map((row) => ({
      outputId: row.outputId,
      outputName: row.outputName,
      lastSeenAt: row.browserReportedAt,
      offlineForMs: row.offlineForMs,
    }))
    .sort((a, b) => b.offlineForMs - a.offlineForMs);

  return { success: true, data: offline };
}
