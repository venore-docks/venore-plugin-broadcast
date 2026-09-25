// Leitura de link do YouTube pra transmissão ao vivo (features/live-stream). Função pura: aceita os
// formatos que alguém copia da barra do navegador ou do botão "Compartilhar" e devolve só o id do
// vídeo (11 caracteres) — é ele, e nunca a URL crua do admin, que vira o src do <iframe> na TV
// (LiveStreamScreen, output-canvas.tsx). Assim a TV só embeda youtube.com/embed/<id validado>,
// nunca uma URL arbitrária.

const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtu.be",
  "www.youtube-nocookie.com",
  "youtube-nocookie.com",
]);

// Caminhos "/<prefixo>/<id>" que carregam o id do vídeo direto no path.
const ID_PATH_PREFIXES = ["live", "embed", "shorts", "v"];

export type ParsedYouTubeLink =
  | { kind: "video"; videoId: string }
  // Link de canal (youtube.com/@canal/live, /channel/UC…/live) — não aponta pra UMA transmissão,
  // aponta pra "o que o canal estiver transmitindo agora", que sem a API do YouTube não dá pra
  // resolver pra um id. Devolvido à parte pra validação dar uma mensagem útil em vez de "inválido".
  | { kind: "channel" }
  | { kind: "invalid" };

export function parseYouTubeLink(input: string): ParsedYouTubeLink {
  const raw = input.trim();
  if (VIDEO_ID_PATTERN.test(raw)) return { kind: "video", videoId: raw };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { kind: "invalid" };
  }
  if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return { kind: "invalid" };

  const segments = url.pathname.split("/").filter(Boolean);

  if (url.hostname.toLowerCase() === "youtu.be") {
    return asVideo(segments[0]);
  }

  if (segments[0] === "watch") {
    return asVideo(url.searchParams.get("v"));
  }

  if (segments.length >= 2 && ID_PATH_PREFIXES.includes(segments[0])) {
    return asVideo(segments[1]);
  }

  if (segments[0]?.startsWith("@") || segments[0] === "channel" || segments[0] === "c" || segments[0] === "user") {
    return { kind: "channel" };
  }

  return { kind: "invalid" };
}

function asVideo(candidate: string | null | undefined): ParsedYouTubeLink {
  return candidate && VIDEO_ID_PATTERN.test(candidate) ? { kind: "video", videoId: candidate } : { kind: "invalid" };
}

// URL canônica de "assistir" — usada na consulta oEmbed e mostrada no admin. Montada a partir do id
// validado, não da URL original (que pode carregar parâmetros de rastreio, &t=, &list= etc.).
export function youTubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}

// src do <iframe> na TV: autoplay com som (mute=0 — só funciona no navegador de TV configurado com
// --autoplay-policy=no-user-gesture-required, mesma exigência dos vídeos "Tocar áudio na TV"), sem
// controles, sem vídeos relacionados no fim, sem anotações e sem atalho de teclado.
// enablejsapi=1: deixa a view da TV mandar comandos pro player via postMessage — usado pra desligar
// a legenda (YOUTUBE_DISABLE_CAPTIONS_MESSAGES). cc_load_policy=0 sozinho NÃO desliga: o YouTube só
// honra o valor 1 (forçar); legenda automática/preferência do navegador continua ligando.
export function youTubeEmbedUrl(videoId: string): string {
  const params = new URLSearchParams({
    autoplay: "1",
    mute: "0",
    enablejsapi: "1",
    cc_load_policy: "0",
    controls: "0",
    playsinline: "1",
    rel: "0",
    iv_load_policy: "3",
    disablekb: "1",
    modestbranding: "1",
  });
  return `https://www.youtube.com/embed/${videoId}?${params.toString()}`;
}

// Comandos da IFrame Player API (formato postMessage, sem carregar o script youtube.com/iframe_api)
// que descarregam o módulo de legendas — "captions" (player HTML5 atual) e "cc" (nome antigo). O
// player recarrega o módulo em troca de qualidade/reconexão da transmissão, por isso a TV reenvia
// periodicamente (LiveStreamScreen, output-canvas.tsx). Comando repetido é inofensivo.
export const YOUTUBE_DISABLE_CAPTIONS_MESSAGES: readonly string[] = ["captions", "cc"].map((module) =>
  JSON.stringify({ event: "command", func: "unloadModule", args: [module] }),
);

export const YOUTUBE_PLAYER_ORIGIN = "https://www.youtube.com";

export function youTubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`;
}
