// Usado tanto no caminho imediato (gate.ts, quem tem broadcast.manage) quanto no caminho aprovado
// (approve-content-change/service.ts) pra preencher targetId de uma CRIAÇÃO só depois que ela
// aconteceu (não existe id antes de o item ser inserido). Itens únicos (BroadcastPlaylistItemRecord,
// BroadcastAlertRecord, BroadcastTakeoverRecord) têm `id`; resultados em lista (reorder,
// add-scanned) não — ficam com targetId null de propósito (afetam a playlist inteira, não um único
// alvo).
export function inferTargetId(data: unknown): string | null {
  if (data && typeof data === "object" && "id" in data) {
    const id = (data as { id: unknown }).id;
    if (typeof id === "string") return id;
  }
  return null;
}
