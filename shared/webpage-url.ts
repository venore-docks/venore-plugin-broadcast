// Validação compartilhada por add-webpage-playlist-item e update-playlist-item (as duas únicas
// escritas de item "webpage") — antes cada uma tinha sua própria cópia idêntica; extraída aqui pra
// não divergir de novo. Pedido explícito (2026-09-04): "APENAS ROTAS DO DOMINIO podem ser
// adicionadas. Nunca sites externos".
//
// DESBLOQUEADO TEMPORARIAMENTE (2026-09-18, pedido do operador): precisa transmitir a tela de um
// outro site Venore Docks (fora deste domínio), então URL http(s) absoluta voltou a ser aceita —
// era o comportamento antes de 2026-09-04. Rota interna ("/...") continua funcionando igual.
// Reativar a restrição (voltar a só aceitar "/...") quando não precisar mais disso.
//
// "//host/..." (protocolo-relativo) segue rejeitado — ambíguo sobre em qual protocolo resolve;
// usar URL absoluta com http(s):// explícito.
export function isValidInternalWebpageRoute(url: string): boolean {
  if (url.startsWith("/")) return !url.startsWith("//");
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export const INVALID_WEBPAGE_ROUTE_MESSAGE =
  'Informe uma rota interna começando com "/" (ex: /cursos) ou uma URL completa (https://...).';
