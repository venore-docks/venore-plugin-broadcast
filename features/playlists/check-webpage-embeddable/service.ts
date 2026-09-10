import type { CheckWebpageEmbeddableInput, CheckWebpageEmbeddableResult, WebpageEmbeddable } from "./types";

const PROBE_TIMEOUT_MS = 5000;

// Heurística sobre os cabeçalhos de anti-embedding. Conservadora: na dúvida devolve "unknown" (sem
// aviso), nunca "yes" com falso negativo silenciando um problema real.
function classifyHeaders(headers: Headers): { embeddable: WebpageEmbeddable; reason: string | null } {
  const xfo = headers.get("x-frame-options");
  if (xfo) {
    const value = xfo.trim().toUpperCase();
    if (value === "DENY" || value === "SAMEORIGIN" || value.startsWith("ALLOW-FROM")) {
      return { embeddable: "likely-blocked", reason: `o site respondeu X-Frame-Options: ${xfo.trim()}` };
    }
  }

  const csp = headers.get("content-security-policy");
  if (csp && /frame-ancestors/i.test(csp)) {
    const directive = csp
      .split(";")
      .map((part) => part.trim())
      .find((part) => /^frame-ancestors/i.test(part));
    // frame-ancestors * (ou http:/https: curinga) libera geral; qualquer outra coisa restringe.
    if (directive && !/frame-ancestors\s+([*]|https?:)\s*$/i.test(directive)) {
      return { embeddable: "likely-blocked", reason: `o site restringe quem pode embedá-lo (CSP ${directive})` };
    }
  }

  return { embeddable: "yes", reason: null };
}

export async function checkWebpageEmbeddable(input: CheckWebpageEmbeddableInput): Promise<CheckWebpageEmbeddableResult> {
  const url = input.url.trim();

  // Rota interna do próprio site — sempre embeda (mesma origem).
  if (url.startsWith("/")) {
    return { success: true, data: { embeddable: "yes", reason: null } };
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { success: false, error: { code: "broadcast.check-webpage-embeddable.invalid_url", message: "URL inválida." } };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { success: false, error: { code: "broadcast.check-webpage-embeddable.invalid_url", message: "URL inválida." } };
  }

  // Sonda de cabeçalho best-effort. Corpo é ignorado. Timeout curto; qualquer falha de rede vira
  // "unknown" (sem aviso) — não é papel desta checagem travar nada. SSRF: a URL é fornecida pelo
  // admin e o mesmo valor já vai ser embutido num <iframe> na TV de qualquer forma (mesma
  // superfície de confiança); segue só http/https e não expõe o corpo da resposta.
  try {
    const response = await fetch(parsed, {
      method: "GET",
      redirect: "follow",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "VenoreBroadcast/1.0 (+embed-check)" },
    });
    return { success: true, data: classifyHeaders(response.headers) };
  } catch {
    return { success: true, data: { embeddable: "unknown", reason: null } };
  }
}
