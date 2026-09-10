import type { OperationResult } from "@venore/plugin-sdk";

// Sonda best-effort: dá pra este site ser exibido dentro de um <iframe> na TV? Muitos sites
// (Google, redes sociais, bancos) mandam X-Frame-Options / CSP frame-ancestors e ficam em branco.
// NÃO bloqueia adicionar o item — é só um aviso antecipado pro operador (pedido explícito). Rota
// interna ("/algo") sempre embeda.
export type CheckWebpageEmbeddableInput = { url: string };

export type WebpageEmbeddable = "yes" | "likely-blocked" | "unknown";

export type CheckWebpageEmbeddableResult = OperationResult<{
  embeddable: WebpageEmbeddable;
  // Texto curto pro aviso na UI quando "likely-blocked" (ex: "o site respondeu X-Frame-Options:
  // DENY"). null quando "yes"/"unknown".
  reason: string | null;
}>;
