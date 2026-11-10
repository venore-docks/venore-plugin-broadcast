// Slideshow de imagens de uma playlist (v1.10): movimento sutil da imagem enquanto ela está na
// tela (estilo "Ken Burns") + efeito de transição entre uma imagem e a próxima. A configuração é
// POR PLAYLIST (broadcast.playlists.slideshow_*), vale pra todas as imagens dela; vídeo, página,
// notícia e evento em destaque não são afetados.
//
// Este módulo é puro (sem React, sem banco) — o servidor valida com ele e a view da TV traduz a
// configuração em CSS com ele (layer-renderer.tsx), então os dois lados nunca divergem.

export const SLIDESHOW_MOTIONS = ["none", "zoom-in", "zoom-out", "pan-left", "pan-right", "pan-up", "pan-down", "mix"] as const;
export type SlideshowMotion = (typeof SLIDESHOW_MOTIONS)[number];

export const SLIDESHOW_MOTION_STRENGTHS = ["soft", "medium", "strong"] as const;
export type SlideshowMotionStrength = (typeof SLIDESHOW_MOTION_STRENGTHS)[number];

export const SLIDESHOW_TRANSITIONS = ["none", "fade", "slide", "zoom", "wipe", "mix"] as const;
export type SlideshowTransition = (typeof SLIDESHOW_TRANSITIONS)[number];

// Transições que de fato existem como animação (o "mix" sorteia entre estas).
export type SlideshowConcreteTransition = Exclude<SlideshowTransition, "none" | "mix">;

export const SLIDESHOW_TRANSITION_MIN_MS = 200;
export const SLIDESHOW_TRANSITION_MAX_MS = 3000;
// Pedido explícito do usuário no roadmap: crossfade "dinâmico e RÁPIDO — nunca lento/arrastado".
export const SLIDESHOW_DEFAULT_TRANSITION_MS = 700;

export type BroadcastPlaylistSlideshow = {
  motion: SlideshowMotion;
  motionStrength: SlideshowMotionStrength;
  transition: SlideshowTransition;
  transitionMs: number;
};

// Sem movimento e sem transição = comportamento de antes da v1.10 (corte seco, imagem parada), pra
// playlists que já existiam não mudarem de aparência sozinhas.
export const DEFAULT_PLAYLIST_SLIDESHOW: BroadcastPlaylistSlideshow = {
  motion: "none",
  motionStrength: "medium",
  transition: "none",
  transitionMs: SLIDESHOW_DEFAULT_TRANSITION_MS,
};

export const SLIDESHOW_MOTION_LABELS: Record<SlideshowMotion, string> = {
  none: "Sem movimento",
  "zoom-in": "Zoom in (aproxima)",
  "zoom-out": "Zoom out (afasta)",
  "pan-left": "Pan para a esquerda",
  "pan-right": "Pan para a direita",
  "pan-up": "Pan para cima",
  "pan-down": "Pan para baixo",
  mix: "Variado (muda a cada imagem)",
};

export const SLIDESHOW_MOTION_STRENGTH_LABELS: Record<SlideshowMotionStrength, string> = {
  soft: "Suave",
  medium: "Médio",
  strong: "Forte",
};

export const SLIDESHOW_TRANSITION_LABELS: Record<SlideshowTransition, string> = {
  none: "Corte seco (sem efeito)",
  fade: "Dissolver (fade)",
  slide: "Deslizar",
  zoom: "Zoom + fade",
  wipe: "Cortina",
  mix: "Variado (muda a cada troca)",
};

export function isSlideshowMotion(value: unknown): value is SlideshowMotion {
  return typeof value === "string" && (SLIDESHOW_MOTIONS as readonly string[]).includes(value);
}
export function isSlideshowMotionStrength(value: unknown): value is SlideshowMotionStrength {
  return typeof value === "string" && (SLIDESHOW_MOTION_STRENGTHS as readonly string[]).includes(value);
}
export function isSlideshowTransition(value: unknown): value is SlideshowTransition {
  return typeof value === "string" && (SLIDESHOW_TRANSITIONS as readonly string[]).includes(value);
}

export function clampTransitionMs(value: number): number {
  if (!Number.isFinite(value)) return SLIDESHOW_DEFAULT_TRANSITION_MS;
  return Math.min(SLIDESHOW_TRANSITION_MAX_MS, Math.max(SLIDESHOW_TRANSITION_MIN_MS, Math.round(value)));
}

// Lê a configuração de qualquer linha crua (banco/estado serializado) sem confiar nos valores:
// campo desconhecido cai no padrão, duração é limitada. Assim uma linha antiga/corrompida nunca
// derruba a view.
export function normalizeSlideshow(raw: {
  slideshowMotion?: unknown;
  slideshowMotionStrength?: unknown;
  slideshowTransition?: unknown;
  slideshowTransitionMs?: unknown;
}): BroadcastPlaylistSlideshow {
  return {
    motion: isSlideshowMotion(raw.slideshowMotion) ? raw.slideshowMotion : DEFAULT_PLAYLIST_SLIDESHOW.motion,
    motionStrength: isSlideshowMotionStrength(raw.slideshowMotionStrength)
      ? raw.slideshowMotionStrength
      : DEFAULT_PLAYLIST_SLIDESHOW.motionStrength,
    transition: isSlideshowTransition(raw.slideshowTransition) ? raw.slideshowTransition : DEFAULT_PLAYLIST_SLIDESHOW.transition,
    transitionMs:
      typeof raw.slideshowTransitionMs === "number"
        ? clampTransitionMs(raw.slideshowTransitionMs)
        : DEFAULT_PLAYLIST_SLIDESHOW.transitionMs,
  };
}

// Hash estável (FNV-1a) — o "variado" precisa escolher a MESMA animação pra mesma imagem em todas
// as TVs do grupo sincronizado e a cada re-render, nada de Math.random().
function stableHash(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const MIX_MOTIONS: Exclude<SlideshowMotion, "none" | "mix">[] = [
  "zoom-in",
  "pan-left",
  "zoom-out",
  "pan-right",
  "zoom-in",
  "pan-up",
  "zoom-out",
  "pan-down",
];

const MIX_TRANSITIONS: SlideshowConcreteTransition[] = ["fade", "slide", "zoom", "wipe"];

export function resolveConcreteMotion(motion: SlideshowMotion, itemId: string): Exclude<SlideshowMotion, "mix"> {
  if (motion !== "mix") return motion;
  return MIX_MOTIONS[stableHash(itemId) % MIX_MOTIONS.length];
}

// "Variado" na transição escolhe pela imagem que ENTRA (mesmo item → mesmo efeito em toda TV).
export function resolveConcreteTransition(transition: SlideshowTransition, incomingItemId: string): SlideshowConcreteTransition | "none" {
  if (transition !== "mix") return transition;
  return MIX_TRANSITIONS[stableHash(incomingItemId) % MIX_TRANSITIONS.length];
}

// Quanto a imagem "cresce" (zoom) / sobra pra deslocar (pan), em fração da própria imagem.
const STRENGTH_DELTA: Record<SlideshowMotionStrength, number> = { soft: 0.06, medium: 0.12, strong: 0.2 };

export type SlideMotionKeyframes = {
  // Valores prontos pra custom properties CSS (--kb-*), lidas pelo @keyframes broadcast-slide-motion.
  fromTransform: string;
  toTransform: string;
};

// Transform inicial/final do movimento. Todo movimento mantém scale >= 1 pra nunca expor a borda
// da imagem (pan usa scale fixo 1+delta e desloca no máximo delta/2 pra cada lado).
export function buildSlideMotion(
  motion: SlideshowMotion,
  strength: SlideshowMotionStrength,
  itemId: string,
): SlideMotionKeyframes | null {
  const concrete = resolveConcreteMotion(motion, itemId);
  if (concrete === "none") return null;

  const delta = STRENGTH_DELTA[strength];
  const grown = 1 + delta;
  const shift = Number(((delta / 2) * 100).toFixed(3)); // % da imagem

  const t = (x: number, y: number, scale: number) => `translate3d(${x}%, ${y}%, 0) scale(${scale})`;

  switch (concrete) {
    case "zoom-in":
      return { fromTransform: t(0, 0, 1), toTransform: t(0, 0, grown) };
    case "zoom-out":
      return { fromTransform: t(0, 0, grown), toTransform: t(0, 0, 1) };
    case "pan-left":
      return { fromTransform: t(shift, 0, grown), toTransform: t(-shift, 0, grown) };
    case "pan-right":
      return { fromTransform: t(-shift, 0, grown), toTransform: t(shift, 0, grown) };
    case "pan-up":
      return { fromTransform: t(0, shift, grown), toTransform: t(0, -shift, grown) };
    case "pan-down":
      return { fromTransform: t(0, -shift, grown), toTransform: t(0, shift, grown) };
  }
}

// Duração da animação de movimento: o tempo que a imagem fica na tela + a sobreposição da
// transição (a imagem que sai continua se mexendo enquanto dissolve, sem "travar" no meio).
export function slideMotionDurationMs(displaySeconds: number, transitionMs: number): number {
  return Math.max(1000, Math.round(displaySeconds * 1000) + transitionMs);
}

export type SlideshowValidationError = { field: string; message: string };

// Valida a entrada do admin (formulário/ação). Retorna a config limpa ou o primeiro erro.
export function parseSlideshowInput(input: {
  motion: unknown;
  motionStrength: unknown;
  transition: unknown;
  transitionMs: unknown;
}): { ok: true; value: BroadcastPlaylistSlideshow } | { ok: false; error: SlideshowValidationError } {
  if (!isSlideshowMotion(input.motion)) {
    return { ok: false, error: { field: "motion", message: "Movimento inválido." } };
  }
  if (!isSlideshowMotionStrength(input.motionStrength)) {
    return { ok: false, error: { field: "motionStrength", message: "Intensidade do movimento inválida." } };
  }
  if (!isSlideshowTransition(input.transition)) {
    return { ok: false, error: { field: "transition", message: "Transição inválida." } };
  }
  const ms = typeof input.transitionMs === "number" ? input.transitionMs : Number(input.transitionMs);
  if (!Number.isFinite(ms) || ms < SLIDESHOW_TRANSITION_MIN_MS || ms > SLIDESHOW_TRANSITION_MAX_MS) {
    return {
      ok: false,
      error: {
        field: "transitionMs",
        message: `A duração da transição deve ficar entre ${SLIDESHOW_TRANSITION_MIN_MS} e ${SLIDESHOW_TRANSITION_MAX_MS} ms.`,
      },
    };
  }
  return {
    ok: true,
    value: {
      motion: input.motion,
      motionStrength: input.motionStrength,
      transition: input.transition,
      transitionMs: Math.round(ms),
    },
  };
}
