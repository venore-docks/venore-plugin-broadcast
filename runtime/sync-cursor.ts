// Cursor de reprodução sincronizada por playlist (v1.8, abordagem A). Estado em memória, por
// processo — mesma pegada de runtime/output-bus.ts / pin-attempts.ts (infra de runtime, não uma
// feature: sem handler/service/store). Assume um único processo Node de longa duração; num deploy
// multi-instância isto precisa migrar pra um store compartilhado (Redis etc.).
//
// Como funciona: sempre que 2+ telas tocam a MESMA playlist P — independente de grupo, sempre
// ligado desde v1.8.4 — o servidor guarda { qual item, quando começou } pra P. get-output-state
// devolve isso pra cada TV que toca P; a view mostra o item e dá seek no <video> pra bater
// `startedAtMs`. Quando qualquer TV chega ao fim do item (onEnded / timer), ela faz POST em
// /api/broadcast/output/:token/sync-advance — a primeira que reportar avança o cursor, as outras
// são ignoradas por ADVANCE_DEBOUNCE_MS. Não é frame-a-frame: fica na casa de 0,5–2s entre telas
// (rede + seek). Uma única tela tocando P sozinha também passa por aqui (cursor com 1 assinante só)
// — sem custo relevante, é uma leitura de Map em memória.

type SyncCursorEntry = {
  itemIndex: number;
  itemId: string;
  startedAtMs: number;
};

// Reports de "acabou o item" que chegam dentro dessa janela depois de um avanço são ignorados —
// só pra deduplicar as várias TVs do grupo reportando quase juntas. Curto de propósito: se fosse
// longo (ex: 2s), um item de vídeo mais curto que isso nunca avançaria (a TV ficaria presa no
// frame final). Itens abaixo de ~0,6s não são um caso de uso suportado na sincronização.
export const ADVANCE_DEBOUNCE_MS = 600;

type SyncCursorGlobal = typeof globalThis & {
  __broadcastSyncCursors?: Map<string, SyncCursorEntry>;
};

function getMap(): Map<string, SyncCursorEntry> {
  const g = globalThis as SyncCursorGlobal;
  if (!g.__broadcastSyncCursors) g.__broadcastSyncCursors = new Map();
  return g.__broadcastSyncCursors;
}

// Resolve o cursor válido pra playlist. Três casos: (1) ninguém começou a tocar ainda — cria no
// item 0 começando agora, a 1ª TV a pedir o estado ancora o grupo; (2) o item atual ainda existe
// — devolve o cursor, reindexado se a playlist foi reordenada (o item é o mesmo, só mudou de
// posição, o relógio dele continua valendo); (3) o item atual SUMIU da playlist (removido/
// ocultado em edição) — reancora na MESMA POSIÇÃO ORDINAL (clampada ao tamanho atual), não sempre
// no item 0. Pedido do backlog: "cursor não deve resetar pro item 0 quando o item atual some da
// playlist em edição... causa salto visível em todas as telas do grupo" — editar o FIM de uma
// playlist de 20 itens enquanto o grupo toca o item 3 não deveria mandar todo mundo de volta pro
// início. Só reinicia o relógio (startedAtMs = agora) nesse terceiro caso: o item em si mudou,
// então o tempo decorrido do item antigo não significa nada pro novo.
export function resolveSyncCursor(playlistId: string, orderedItemIds: string[]): SyncCursorEntry {
  const map = getMap();
  const existing = map.get(playlistId);

  if (!existing) {
    const created: SyncCursorEntry = { itemIndex: 0, itemId: orderedItemIds[0], startedAtMs: Date.now() };
    map.set(playlistId, created);
    return created;
  }

  const currentPos = orderedItemIds.indexOf(existing.itemId);
  if (currentPos !== -1) {
    // Item ainda existe, mas pode ter mudado de POSIÇÃO (a playlist foi reordenada) — devolve o
    // índice da ordem ATUAL, não o que foi gravado quando o cursor foi criado (senão o cliente
    // mostraria o item errado pro índice). startedAtMs não muda: é o mesmo item ainda tocando, só
    // a posição na lista mudou, o relógio dele continua valendo.
    if (currentPos === existing.itemIndex) return existing;
    const reindexed: SyncCursorEntry = { ...existing, itemIndex: currentPos };
    map.set(playlistId, reindexed);
    return reindexed;
  }

  const recoveredIndex = Math.min(existing.itemIndex, orderedItemIds.length - 1);
  const recovered: SyncCursorEntry = { itemIndex: recoveredIndex, itemId: orderedItemIds[recoveredIndex], startedAtMs: Date.now() };
  map.set(playlistId, recovered);
  return recovered;
}

export function peekSyncCursor(playlistId: string): SyncCursorEntry | null {
  return getMap().get(playlistId) ?? null;
}

// Avança o cursor se `reportedItemId` é de fato o item atual e passou da janela de debounce.
// Devolve true quando avançou (o chamador então empurra o evento SSE), false quando ignorou.
export function advanceSyncCursor(playlistId: string, reportedItemId: string, orderedItemIds: string[]): boolean {
  const map = getMap();
  const current = map.get(playlistId);
  if (!current || orderedItemIds.length === 0) return false;
  // Report atrasado / de outra TV que ainda estava no item anterior.
  if (current.itemId !== reportedItemId) return false;
  if (Date.now() - current.startedAtMs < ADVANCE_DEBOUNCE_MS) return false;

  const currentPos = orderedItemIds.indexOf(current.itemId);
  // currentPos === -1: o item que acabou de terminar foi removido da playlist enquanto tocava.
  // Mesmo racional de resolveSyncCursor — avança a partir da MESMA posição ordinal que ele tinha
  // (clampada), não sempre de volta pro item 0.
  const nextPos = currentPos === -1 ? Math.min(current.itemIndex, orderedItemIds.length - 1) : (currentPos + 1) % orderedItemIds.length;
  map.set(playlistId, { itemIndex: nextPos, itemId: orderedItemIds[nextPos], startedAtMs: Date.now() });
  return true;
}
