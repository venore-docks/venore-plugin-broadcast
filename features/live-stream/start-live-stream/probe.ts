import { youTubeWatchUrl } from "../../../shared/youtube";

const PROBE_TIMEOUT_MS = 4000;

export type YouTubeProbe =
  | { status: "ok"; title: string | null }
  // Dono do vídeo desativou "permitir incorporação" — o iframe na TV mostraria só um erro.
  | { status: "not-embeddable" }
  | { status: "not-found" }
  // Sem rede / YouTube fora / resposta inesperada — não bloqueia (o servidor pode estar numa LAN
  // sem saída pra internet enquanto as TVs têm): segue sem título.
  | { status: "unknown" };

// Consulta o oEmbed público do YouTube (sem chave de API) pra pegar o título e pegar cedo os dois
// erros que só apareceriam na TV: vídeo inexistente/privado e incorporação desativada. Mesmo
// espírito de check-webpage-embeddable: best-effort, timeout curto, nunca trava por falha de rede.
export async function probeYouTubeVideo(videoId: string): Promise<YouTubeProbe> {
  const endpoint = new URL("https://www.youtube.com/oembed");
  endpoint.searchParams.set("url", youTubeWatchUrl(videoId));
  endpoint.searchParams.set("format", "json");

  try {
    const response = await fetch(endpoint, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      headers: { "user-agent": "VenoreBroadcast/1.0 (+live-stream)" },
    });
    if (response.status === 401) return { status: "not-embeddable" };
    if (response.status === 400 || response.status === 403 || response.status === 404) return { status: "not-found" };
    if (!response.ok) return { status: "unknown" };

    const body = (await response.json()) as { title?: unknown };
    const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : null;
    return { status: "ok", title };
  } catch {
    return { status: "unknown" };
  }
}
