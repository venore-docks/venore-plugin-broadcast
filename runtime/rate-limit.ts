// Rate limit simples em memória, por processo (mesma pegada de output-bus.ts/sync-cursor.ts,
// mesma suposição de processo único documentada nos dois). Backlog: "rate limit nos endpoints
// públicos por token (especialmente /sync-advance)" — essas rotas não têm sessão/RBAC de
// propósito (a TV não faz login), então o token é o único jeito de restringir alguma coisa; se um
// token vazar (print de tela, cabo trocado), isto pelo menos freia um flood em vez de deixar
// aberto.
//
// Janela FIXA, não deslizante — mais barato de calcular (um contador + timestamp por chave, sem
// guardar histórico de timestamps) e simples o bastante pro que resolve: distinguir tráfego normal
// de flood, não medir taxa com precisão.

type RateLimitGlobal = typeof globalThis & {
  __broadcastRateLimits?: Map<string, { count: number; windowStartMs: number }>;
};

function getMap(): Map<string, { count: number; windowStartMs: number }> {
  const g = globalThis as RateLimitGlobal;
  if (!g.__broadcastRateLimits) g.__broadcastRateLimits = new Map();
  return g.__broadcastRateLimits;
}

// Devolve true quando a chamada é permitida (dentro do limite), false quando deveria ser recusada
// (429). `key` deve identificar rota+token junto (ex: "sync-advance:<token>") — os limites são
// independentes por rota, gastar a cota de uma nunca afeta outra.
export function checkRateLimit(key: string, limit: number, windowMs: number): boolean {
  const map = getMap();
  const now = Date.now();
  const entry = map.get(key);

  if (!entry || now - entry.windowStartMs >= windowMs) {
    map.set(key, { count: 1, windowStartMs: now });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count += 1;
  return true;
}
