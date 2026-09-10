// Cursor de reprodução sincronizada por playlist (v1.8, abordagem A). Estado em memória, por
// processo — mesma pegada de runtime/output-bus.ts / pin-attempts.ts (infra de runtime, não uma
// feature: sem handler/service/store). Assume um único processo Node de longa duração; num deploy
// multi-instância isto precisa migrar pra um store compartilhado (Redis etc.).
//
// Como funciona: quando um grupo está marcado como "sincronizado" (setting broadcast.syncedGroups)
// e suas telas tocam a MESMA playlist P, o servidor guarda { qual item, quando começou } pra P.
// get-output-state devolve isso pra cada TV do grupo; a view mostra o item e dá seek no <video>
// pra bater `startedAtMs`. Quando qualquer TV do grupo chega ao fim do item (onEnded / timer), ela
// faz POST em /api/broadcast/output/:token/sync-advance — a primeira que reportar avança o cursor,
// as outras são ignoradas por ADVANCE_DEBOUNCE_MS. Não é frame-a-frame: fica na casa de 0,5–2s
// entre telas (rede + seek).

type SyncCursorEntry = {
  itemIndex: number;
  itemId: string;
  startedAtMs: number;
};

// Reports de "acabou o item" que chegam dentro dessa janela depois de um avanço são ignorados —
// várias TVs do grupo reportam quase juntas.
export const ADVANCE_DEBOUNCE_MS = 2000;

type SyncCursorGlobal = typeof globalThis & {
  __broadcastSyncCursors?: Map<string, SyncCursorEntry>;
};

function getMap(): Map<string, SyncCursorEntry> {
  const g = globalThis as SyncCursorGlobal;
  if (!g.__broadcastSyncCursors) g.__broadcastSyncCursors = new Map();
  return g.__broadcastSyncCursors;
}

// Cursor atual de uma playlist. Se ainda não existe (ninguém começou a tocar), cria no item 0
// começando agora — assim a 1ª TV a pedir o estado já ancora o grupo.
export function ensureSyncCursor(playlistId: string, firstItemId: string): SyncCursorEntry {
  const map = getMap();
  const existing = map.get(playlistId);
  if (existing) return existing;
  const created: SyncCursorEntry = { itemIndex: 0, itemId: firstItemId, startedAtMs: Date.now() };
  map.set(playlistId, created);
  return created;
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
  const nextPos = currentPos === -1 ? 0 : (currentPos + 1) % orderedItemIds.length;
  map.set(playlistId, { itemIndex: nextPos, itemId: orderedItemIds[nextPos], startedAtMs: Date.now() });
  return true;
}

// Some com o cursor — chamado quando a playlist muda de itens (add/remove/reorder) ou quando o
// grupo deixa de ser sincronizado, pra o próximo estado re-ancorar do zero.
export function resetSyncCursor(playlistId: string): void {
  getMap().delete(playlistId);
}
