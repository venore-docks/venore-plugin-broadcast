import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkRateLimit } from "./rate-limit";

afterEach(() => {
  delete (globalThis as { __broadcastRateLimits?: unknown }).__broadcastRateLimits;
  vi.useRealTimers();
});

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
});

describe("checkRateLimit", () => {
  it("permite chamadas até o limite dentro da janela", () => {
    expect(checkRateLimit("route:tok-1", 3, 1000)).toBe(true);
    expect(checkRateLimit("route:tok-1", 3, 1000)).toBe(true);
    expect(checkRateLimit("route:tok-1", 3, 1000)).toBe(true);
  });

  it("recusa a partir da chamada que excede o limite dentro da mesma janela", () => {
    checkRateLimit("route:tok-1", 3, 1000);
    checkRateLimit("route:tok-1", 3, 1000);
    checkRateLimit("route:tok-1", 3, 1000);

    expect(checkRateLimit("route:tok-1", 3, 1000)).toBe(false);
  });

  it("libera de novo depois que a janela expira", () => {
    checkRateLimit("route:tok-1", 2, 1000);
    checkRateLimit("route:tok-1", 2, 1000);
    expect(checkRateLimit("route:tok-1", 2, 1000)).toBe(false);

    vi.advanceTimersByTime(1000);

    expect(checkRateLimit("route:tok-1", 2, 1000)).toBe(true);
  });

  it("mantém contadores independentes por chave — uma rota/token não gasta a cota de outra", () => {
    checkRateLimit("sync-advance:tok-1", 1, 1000);
    expect(checkRateLimit("sync-advance:tok-1", 1, 1000)).toBe(false);

    // Mesmo token, rota diferente: cota própria.
    expect(checkRateLimit("output-state:tok-1", 1, 1000)).toBe(true);
    // Mesma rota, token diferente: cota própria.
    expect(checkRateLimit("sync-advance:tok-2", 1, 1000)).toBe(true);
  });
});
