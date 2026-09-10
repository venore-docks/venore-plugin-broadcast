// Vocabulário de cor/estilo FIXO da view de saída (a que abre na TV) — deliberadamente FORA do
// vocabulário de tokens shadcn do admin. Racional (ver também docs / AGENTS.md §4 do core): a view
// de saída é um overlay fixo sobre vídeo/foto, numa rota `standalone` que NÃO tem contexto de tema
// (não passa pela shell do (platform), não recebe `data-theme`). Um `bg-card`/`text-primary` aqui
// resolveria pro tema do último admin que abriu — errado. Então a TV tem a própria paleta,
// centralizada AQUI (Ponto 9 #6) em vez de repetida como literal por todo o layer-renderer.tsx.
//
// A cor de marca configurável do operador (broadcast.brandColor) continua vindo por prop/estado
// (não é destes tokens) — estes são os valores que NÃO variam por instalação.

// Fundo padrão do painel de agenda quando o operador não escolheu cor própria.
export const DEFAULT_AGENDA_BACKGROUND = "#0f0f0f";

// Destaque da view: badge "Hoje", fonte da notícia, ponto ativo do rodízio de agenda.
export const TV_ACCENT_COLOR = "#F4B000";
export const TV_ACCENT_COLOR_SOFT = "rgba(244,176,0,0.16)";
export const TV_ACCENT_FOREGROUND = "#0F0F0F";

// Gradiente do AlertBanner (aviso urgente).
export const TV_ALERT_GRADIENT = "linear-gradient(90deg, #B3261E, #E8482C)";

// Status "Acontecendo" (evento em andamento) — laranja vívido, distinto do dourado do accent pra
// dar pra diferenciar de relance. Foreground escuro (texto branco teria contraste ruim).
export const TV_HAPPENING_NOW_COLOR = "#FF8A00";
export const TV_HAPPENING_NOW_FOREGROUND = "#0F0F0F";

// Texto e véu sobre mídia — usados soltos em vários pontos do render; aqui pra parar de repetir.
export const TV_TEXT = "#FFFFFF";
export const TV_TEXT_DIM = "rgba(255,255,255,0.4)";
