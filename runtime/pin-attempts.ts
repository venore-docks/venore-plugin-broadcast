// Limitador de tentativas de PIN da view de saída — estado em memória, por processo, mesma pegada
// do pub/sub em runtime/output-bus.ts (não é uma feature: sem handler/service/store/authorizeActor,
// é infraestrutura de runtime). Assume um único processo Node de longa duração — o mesmo
// pressuposto já documentado no output-bus; se virar multi-instância, isto precisa migrar pra um
// store compartilhado (Redis etc.).
//
// Chave é (token + IP): trava a combinação, não o token inteiro — uma TV legítima atrás de outro
// IP continua conseguindo digitar o PIN enquanto um atacante num IP fica de castigo. O reset via
// admin (features/outputs/reset-output-pin-attempts) limpa TODAS as chaves de um token de uma vez.

type PinAttemptEntry = {
  // Falhas consecutivas desde o último bloqueio/acerto. Zera ao atingir o teto (vira um bloqueio).
  failures: number;
  // Epoch ms até quando a combinação está bloqueada, ou null se não está.
  blockedUntil: number | null;
  // Quantos bloqueios essa combinação já acumulou — alimenta o backoff progressivo abaixo.
  blockCount: number;
};

// Depois de N falhas consecutivas, a combinação (token+IP) é bloqueada.
export const MAX_FAILURES_BEFORE_BLOCK = 5;
// Duração do bloqueio: base dobra a cada bloqueio já sofrido, com teto — 1min, 2, 4, 8, 16, 30...
export const BLOCK_BASE_MINUTES = 1;
export const BLOCK_MAX_MINUTES = 30;

// Guardado em globalThis, não numa variável de módulo — Server Action (routes/out/actions.ts) e
// Route Handler podem acabar com cópias avaliadas diferentes deste módulo no bundle do Next
// (mesmo bug real que levou o output-bus a fazer isto). globalThis é o único objeto garantidamente
// compartilhado entre as camadas dentro do mesmo processo.
type PinAttemptsGlobal = typeof globalThis & {
  __broadcastPinAttempts?: Map<string, PinAttemptEntry>;
};

function getAttemptsMap(): Map<string, PinAttemptEntry> {
  const globalWithAttempts = globalThis as PinAttemptsGlobal;
  if (!globalWithAttempts.__broadcastPinAttempts) {
    globalWithAttempts.__broadcastPinAttempts = new Map();
  }
  return globalWithAttempts.__broadcastPinAttempts;
}

function keyFor(token: string, ip: string): string {
  return `${token}::${ip}`;
}

function blockDurationMs(blockCount: number): number {
  const minutes = Math.min(BLOCK_BASE_MINUTES * 2 ** Math.max(0, blockCount - 1), BLOCK_MAX_MINUTES);
  return minutes * 60_000;
}

export type PinAttemptStatus = { blocked: boolean; retryAfterSeconds: number };

function statusFrom(entry: PinAttemptEntry | undefined, now: number): PinAttemptStatus {
  if (entry?.blockedUntil && entry.blockedUntil > now) {
    return { blocked: true, retryAfterSeconds: Math.ceil((entry.blockedUntil - now) / 1000) };
  }
  return { blocked: false, retryAfterSeconds: 0 };
}

// Chamado ANTES de conferir o PIN — se a combinação está de castigo, nem tenta.
export function checkPinAttempt(token: string, ip: string): PinAttemptStatus {
  return statusFrom(getAttemptsMap().get(keyFor(token, ip)), Date.now());
}

// Registra uma falha de PIN. Ao atingir MAX_FAILURES_BEFORE_BLOCK, vira um bloqueio (backoff
// progressivo por blockCount) e o contador de falhas zera. Devolve o status resultante.
export function registerPinFailure(token: string, ip: string): PinAttemptStatus {
  const map = getAttemptsMap();
  const key = keyFor(token, ip);
  const now = Date.now();
  const entry: PinAttemptEntry = map.get(key) ?? { failures: 0, blockedUntil: null, blockCount: 0 };

  // Já bloqueado agora: não conta falha nova, só ecoa o tempo restante.
  if (entry.blockedUntil && entry.blockedUntil > now) {
    map.set(key, entry);
    return statusFrom(entry, now);
  }

  entry.failures += 1;
  if (entry.failures >= MAX_FAILURES_BEFORE_BLOCK) {
    entry.blockCount += 1;
    entry.blockedUntil = now + blockDurationMs(entry.blockCount);
    entry.failures = 0;
  }
  map.set(key, entry);
  return statusFrom(entry, now);
}

// Acerto do PIN — limpa a combinação (token+IP) por inteiro, incluindo o histórico de blockCount.
export function registerPinSuccess(token: string, ip: string): void {
  getAttemptsMap().delete(keyFor(token, ip));
}

// Reset via admin — zera o contador de TODAS as combinações (todos os IPs) de um token. Sem I/O:
// só apaga entradas do Map. Devolve quantas entradas foram limpas (pro toast do admin).
export function clearPinAttemptsForToken(token: string): number {
  const map = getAttemptsMap();
  const prefix = `${token}::`;
  let cleared = 0;
  for (const key of [...map.keys()]) {
    if (key.startsWith(prefix)) {
      map.delete(key);
      cleared += 1;
    }
  }
  return cleared;
}

// Existe algum bloqueio ativo pra este token agora (qualquer IP)? — usado pelo admin pra decidir
// se mostra o botão "Liberar tentativas de PIN".
export function hasActivePinBlockForToken(token: string): boolean {
  const now = Date.now();
  const prefix = `${token}::`;
  for (const [key, entry] of getAttemptsMap()) {
    if (key.startsWith(prefix) && entry.blockedUntil && entry.blockedUntil > now) return true;
  }
  return false;
}

// Todos os tokens com pelo menos um bloqueio ativo agora — o poll do admin pinta um aviso no card
// da tela ("há tentativas de PIN bloqueadas agora") em vez de o operador só descobrir clicando em
// "Liberar" no escuro. Sem I/O: percorre o Map por processo (mesma pegada de getConnectedOutputIps).
export function listTokensWithActivePinBlock(): string[] {
  const now = Date.now();
  const tokens = new Set<string>();
  for (const [key, entry] of getAttemptsMap()) {
    if (entry.blockedUntil && entry.blockedUntil > now) {
      const token = key.slice(0, key.indexOf("::"));
      if (token) tokens.add(token);
    }
  }
  return [...tokens];
}
