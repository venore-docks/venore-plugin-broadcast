// Telemetria que a TV manda DE VOLTA pro servidor (o oposto do output-bus, que é servidor→TV) —
// viewport, navegador, status, "há quanto tempo no ar" e o item que toca agora. Estado em memória
// por processo, mesma pegada e mesma suposição de processo único do output-bus / pin-attempts
// (ver README, Known Gaps). Não é uma feature (sem handler/service/authorizeActor) — infra de
// runtime.
//
// Guardado em globalThis pelo mesmo motivo do output-bus: Server Action e Route Handler podem
// acabar com cópias avaliadas diferentes deste módulo no bundle do Next.

const STALE_AFTER_MS = 90_000;

type BeaconEntry = {
  clientId: string;
  ip: string;
  viewport: string; // "1920x1080" ou "?"
  userAgent: string;
  status: string; // "playing" | "standby" | "disconnected" | "?"
  nowPlaying: string | null; // "3/8 — Institucional.mp4" ou null
  nowPlayingItemId: string | null;
  firstSeenAt: number;
  lastSeenAt: number;
};

export type OutputBeaconSummary = {
  clientId: string;
  ip: string;
  viewport: string;
  browser: string; // rótulo curto derivado do userAgent
  status: string;
  nowPlaying: string | null;
  uptimeSeconds: number;
  lastSeenSecondsAgo: number;
};

type BeaconGlobal = typeof globalThis & {
  __broadcastOutputBeacons?: Map<string, Map<string, BeaconEntry>>;
};

function getBeaconMap(): Map<string, Map<string, BeaconEntry>> {
  const globalWithBeacons = globalThis as BeaconGlobal;
  if (!globalWithBeacons.__broadcastOutputBeacons) {
    globalWithBeacons.__broadcastOutputBeacons = new Map();
  }
  return globalWithBeacons.__broadcastOutputBeacons;
}

// Rótulo curto de navegador a partir do UA — só pro admin reconhecer a TV de relance, não é
// detecção séria. Ordem importa (Edg antes de Chrome, Chrome antes de Safari).
function browserLabel(userAgent: string): string {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\/|Opera/.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  if (!userAgent) return "?";
  return "outro";
}

// Devolve o itemId que ACABOU de começar a tocar nesta conexão (mudou desde o último beacon) —
// null quando não mudou. A rota usa pra registrar o proof-of-play, sem precisar de estado próprio.
export function recordOutputBeacon(
  token: string,
  clientId: string,
  data: { ip: string; viewport: string; userAgent: string; status: string; nowPlaying: string | null; nowPlayingItemId: string | null },
): { startedItemId: string | null } {
  if (!token || !clientId) return { startedItemId: null };
  const map = getBeaconMap();
  const forToken = map.get(token) ?? new Map<string, BeaconEntry>();
  const now = Date.now();
  const existing = forToken.get(clientId);
  const startedItemId =
    data.nowPlayingItemId && data.nowPlayingItemId !== (existing?.nowPlayingItemId ?? null) ? data.nowPlayingItemId : null;
  forToken.set(clientId, {
    clientId,
    ip: data.ip,
    viewport: data.viewport || "?",
    userAgent: data.userAgent || "",
    status: data.status || "?",
    nowPlaying: data.nowPlaying,
    nowPlayingItemId: data.nowPlayingItemId,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
  });
  map.set(token, forToken);
  return { startedItemId };
}

function summarize(entry: BeaconEntry, now: number): OutputBeaconSummary {
  return {
    clientId: entry.clientId,
    ip: entry.ip,
    viewport: entry.viewport,
    browser: browserLabel(entry.userAgent),
    status: entry.status,
    nowPlaying: entry.nowPlaying,
    uptimeSeconds: Math.max(0, Math.round((now - entry.firstSeenAt) / 1000)),
    lastSeenSecondsAgo: Math.max(0, Math.round((now - entry.lastSeenAt) / 1000)),
  };
}

// Poda entradas velhas (TV desligada / aba fechada sem avisar) na leitura — mesma ideia do teto de
// conexões do output-bus, só que por tempo.
function prune(forToken: Map<string, BeaconEntry>, now: number): void {
  for (const [clientId, entry] of forToken) {
    if (now - entry.lastSeenAt > STALE_AFTER_MS) forToken.delete(clientId);
  }
}

export function getAllOutputBeacons(): Record<string, OutputBeaconSummary[]> {
  const map = getBeaconMap();
  const now = Date.now();
  const result: Record<string, OutputBeaconSummary[]> = {};
  for (const [token, forToken] of map) {
    prune(forToken, now);
    if (forToken.size === 0) {
      map.delete(token);
      continue;
    }
    result[token] = [...forToken.values()].map((entry) => summarize(entry, now));
  }
  return result;
}
