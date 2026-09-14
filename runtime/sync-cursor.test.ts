import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADVANCE_DEBOUNCE_MS, advanceSyncCursor, peekSyncCursor, resolveSyncCursor } from "./sync-cursor";

// Estado em globalThis (ver comentário no módulo) — cada teste começa do zero, mesmo padrão de
// output-bus.test.ts.
afterEach(() => {
  delete (globalThis as { __broadcastSyncCursors?: unknown }).__broadcastSyncCursors;
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

describe("resolveSyncCursor", () => {
  it("ancora no item 0 quando ninguém começou a tocar ainda", () => {
    const cursor = resolveSyncCursor("playlist-1", ["a", "b", "c"]);
    expect(cursor).toEqual({ itemIndex: 0, itemId: "a", startedAtMs: Date.now() });
  });

  it("devolve o mesmo cursor (sem reiniciar o relógio) quando o item atual continua na mesma posição", () => {
    resolveSyncCursor("playlist-1", ["a", "b", "c"]);
    vi.advanceTimersByTime(5000);

    const cursor = resolveSyncCursor("playlist-1", ["a", "b", "c"]);
    expect(cursor).toEqual({ itemIndex: 0, itemId: "a", startedAtMs: new Date("2026-01-01T00:00:00.000Z").getTime() });
  });

  it("reindexa (sem reiniciar o relógio) quando o item atual continua na playlist mas mudou de posição", () => {
    resolveSyncCursor("playlist-1", ["a", "b", "c"]); // ancora em "a", índice 0
    vi.advanceTimersByTime(3000);

    // playlist reordenada: "a" agora está no índice 2
    const cursor = resolveSyncCursor("playlist-1", ["b", "c", "a"]);
    expect(cursor.itemId).toBe("a");
    expect(cursor.itemIndex).toBe(2);
    // relógio preservado — é o MESMO item ainda tocando, só mudou de posição na lista.
    expect(cursor.startedAtMs).toBe(new Date("2026-01-01T00:00:00.000Z").getTime());
  });

  // Regressão do backlog: "cursor não deve resetar pro item 0 quando o item atual some da
  // playlist em edição... causa salto visível em todas as telas do grupo".
  it("reancora na MESMA posição ordinal (não no item 0) quando o item atual some da playlist", () => {
    resolveSyncCursor("playlist-1", ["a", "b", "c", "d"]); // âncora: índice 0, "a"
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    advanceSyncCursor("playlist-1", "a", ["a", "b", "c", "d"]); // avança pra índice 1, "b"
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    advanceSyncCursor("playlist-1", "b", ["a", "b", "c", "d"]); // avança pra índice 2, "c"
    expect(peekSyncCursor("playlist-1")).toEqual(expect.objectContaining({ itemIndex: 2, itemId: "c" }));

    // "c" foi removido da playlist em edição — no lugar do índice 2 agora está "e".
    vi.advanceTimersByTime(60_000);
    const cursor = resolveSyncCursor("playlist-1", ["b", "d", "e"]);

    expect(cursor.itemIndex).toBe(2);
    expect(cursor.itemId).toBe("e");
    expect(cursor.startedAtMs).toBe(Date.now());
  });

  it("clampa pro último item quando a posição do item removido não existe mais (a playlist encolheu)", () => {
    resolveSyncCursor("playlist-1", ["a", "b", "c", "d"]);
    // ancorado no índice 0 ("a"); "a" some e a playlist encolhe pra 2 itens.
    const cursor = resolveSyncCursor("playlist-1", ["x", "y"]);
    expect(cursor.itemIndex).toBe(0);
    expect(cursor.itemId).toBe("x");
  });
});

describe("advanceSyncCursor", () => {
  it("ignora um report antes da janela de debounce", () => {
    resolveSyncCursor("playlist-1", ["a", "b"]);
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS - 1);

    const advanced = advanceSyncCursor("playlist-1", "a", ["a", "b"]);
    expect(advanced).toBe(false);
    expect(peekSyncCursor("playlist-1")?.itemId).toBe("a");
  });

  it("avança pro próximo item depois da janela de debounce, dando a volta no fim da lista", () => {
    resolveSyncCursor("playlist-1", ["a", "b"]);
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);

    expect(advanceSyncCursor("playlist-1", "a", ["a", "b"])).toBe(true);
    expect(peekSyncCursor("playlist-1")).toEqual({ itemIndex: 1, itemId: "b", startedAtMs: Date.now() });

    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    expect(advanceSyncCursor("playlist-1", "b", ["a", "b"])).toBe(true);
    expect(peekSyncCursor("playlist-1")?.itemId).toBe("a"); // deu a volta
  });

  it("ignora um report de um item que não é mais o atual (TV atrasada reportando o item anterior)", () => {
    resolveSyncCursor("playlist-1", ["a", "b"]);
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    advanceSyncCursor("playlist-1", "a", ["a", "b"]); // avança pra "b"

    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    const advanced = advanceSyncCursor("playlist-1", "a", ["a", "b"]); // report atrasado, ainda dizendo "a"
    expect(advanced).toBe(false);
    expect(peekSyncCursor("playlist-1")?.itemId).toBe("b");
  });

  // Mesmo racional de resolveSyncCursor pro caso "item sumiu" — avança a partir da posição
  // ordinal que o item tinha, não sempre de volta pro item 0.
  it("avança a partir da mesma posição ordinal quando o item reportado foi removido da playlist", () => {
    resolveSyncCursor("playlist-1", ["a", "b", "c"]);
    advanceSyncCursor("playlist-1", "a", ["a", "b", "c"]); // ainda dentro do debounce, ignora
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    advanceSyncCursor("playlist-1", "a", ["a", "b", "c"]);
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    advanceSyncCursor("playlist-1", "b", ["a", "b", "c"]); // agora no índice 2 ("c")
    expect(peekSyncCursor("playlist-1")?.itemIndex).toBe(2);

    // "c" foi removido enquanto tocava; a playlist agora só tem "b" e "z" no lugar.
    vi.advanceTimersByTime(ADVANCE_DEBOUNCE_MS + 1);
    const advanced = advanceSyncCursor("playlist-1", "c", ["b", "z"]);
    expect(advanced).toBe(true);
    // índice 2 clampado pro último item existente ("z", índice 1), não pro item 0.
    expect(peekSyncCursor("playlist-1")).toEqual({ itemIndex: 1, itemId: "z", startedAtMs: Date.now() });
  });
});
