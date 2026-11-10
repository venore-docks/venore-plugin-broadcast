"use client";

import { useContext, useEffect, useState } from "react";
// Importa direto de shared/, nunca do barrel (@/plugins/broadcast) — "use client", mesmo racional de
// layer-renderer.tsx.
import {
  buildSlideMotion,
  resolveConcreteTransition,
  slideMotionDurationMs,
  type BroadcastPlaylistSlideshow,
  type SlideshowConcreteTransition,
} from "../../shared/slideshow";
import { FreezeContext } from "./now-playing-context";

// Slideshow de imagens de uma playlist (v1.10) — movimento (estilo Ken Burns) + transição entre
// imagens. Os @keyframes usados aqui (broadcast-slide-*) moram no <style> único do canvas, em
// output-canvas.tsx. Usado por PlaylistLayer (layer-renderer.tsx) quando o slide atual é imagem.

// Fim da animação do slide que sai: margem além de transitionMs pra a animação CSS terminar de
// pintar antes de o nó ser removido (sem isso o último frame podia "piscar").
const SLIDE_LEAVE_CLEANUP_MARGIN_MS = 80;

export type ImageSlideInfo = { key: string; itemId: string; durationSeconds: number };

// Uma imagem do slideshow: wrapper (animação de ENTRADA/SAÍDA da transição) > [fundo borrado] +
// <img> (animação de MOVIMENTO, estilo Ken Burns). Dois elementos separados porque os dois
// `transform` não podem coexistir no mesmo nó. Os @keyframes vivem em output-canvas.tsx (<style>
// único do canvas); o movimento lê --kb-from/--kb-to por custom property — engine antiga sem var()
// em @keyframes degrada pra imagem parada, nunca pra tela quebrada.
//
// A imagem que SAI continua montada (mesmo key, mesmo nó DOM) por transitionMs com a animação de
// movimento rodando — por isso slideMotionDurationMs soma a transição à duração de exibição.
function ImageSlideLayer({
  info,
  role,
  effect,
  transitionMs,
  settings,
  objectFitClassName,
  showBlurFill,
  single,
  paused,
}: {
  info: ImageSlideInfo;
  role: "current" | "leaving";
  effect: SlideshowConcreteTransition | "none";
  transitionMs: number;
  settings: BroadcastPlaylistSlideshow;
  objectFitClassName: string;
  showBlurFill: boolean;
  // Playlist de uma imagem só: o avanço cai de volta nela mesma, então o movimento vai e volta em
  // loop (senão pararia no fim e a imagem ficaria congelada por tempo indeterminado).
  single: boolean;
  paused: boolean;
}) {
  const motion = buildSlideMotion(settings.motion, settings.motionStrength, info.itemId);
  const playState = paused ? "paused" : "running";
  const src = `/api/broadcast/stream/${info.itemId}`;

  // Crossfade/zoom/cortina: o slide que sai só fica ABAIXO até ser coberto (sem animação própria).
  // Só o "deslizar" empurra o que sai pra fora.
  const wrapperAnimationName =
    effect === "none"
      ? undefined
      : role === "current"
        ? `broadcast-slide-enter-${effect}`
        : effect === "slide"
          ? "broadcast-slide-leave-slide"
          : undefined;

  // Propriedades individuais (animationName/Duration/…), NUNCA o atalho `animation`: o atalho
  // reseta animation-play-state, e misturar os dois num re-render (entrada → saída) deixava o
  // "congelar" inconsistente (o React avisa: "don't mix shorthand and non-shorthand").
  const wrapperStyle: React.CSSProperties = {
    zIndex: role === "current" ? 2 : 1,
    ...(wrapperAnimationName
      ? {
          animationName: wrapperAnimationName,
          animationDuration: `${transitionMs}ms`,
          animationTimingFunction: "cubic-bezier(0.4, 0, 0.2, 1)",
          animationFillMode: "both",
          animationPlayState: playState,
        }
      : {}),
  };

  return (
    <div
      className="absolute inset-0 overflow-hidden"
      style={wrapperStyle}
    >
      {showBlurFill && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full object-cover"
          style={{ filter: "blur(24px) brightness(0.6)", transform: "scale(1.1)" }}
        />
      )}
      {/* fonte é a rota de stream do plugin (arquivo local ou Blob), não um asset estático do bundle. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        className={`relative h-full w-full ${objectFitClassName}`}
        style={
          motion
            ? ({
                "--kb-from": motion.fromTransform,
                "--kb-to": motion.toTransform,
                animationName: "broadcast-slide-motion",
                animationDuration: `${slideMotionDurationMs(info.durationSeconds, transitionMs)}ms`,
                animationTimingFunction: "linear",
                animationFillMode: "both",
                animationIterationCount: single ? "infinite" : 1,
                animationDirection: single ? "alternate" : "normal",
                animationPlayState: playState,
                willChange: "transform",
              } as React.CSSProperties)
            : undefined
        }
      />
    </div>
  );
}

// Pilha do slideshow: a imagem atual por cima + (durante a transição) a anterior por baixo. Só
// existe enquanto o slide atual é uma imagem — vídeo/página/notícia não passam por aqui, então a
// árvore deles (e as invariantes de remount do <video>, ver VideoZoneLayer) ficam intactas.
// Com transição "none" nunca há slide saindo: corte seco, igual ao comportamento antes da v1.10.
//
// "Ajustar estado durante o render" (setState condicional no corpo, padrão oficial do React pra
// derivar estado de prop) em vez de useEffect: o render que troca a imagem já inclui a que sai, sem
// um quadro intermediário só com a nova (que causaria um corte seco antes da animação).
export function ImageSlideStack({
  slide,
  settings,
  objectFitClassName,
  showBlurFill,
  single,
}: {
  slide: ImageSlideInfo;
  settings: BroadcastPlaylistSlideshow;
  objectFitClassName: string;
  showBlurFill: boolean;
  single: boolean;
}) {
  const frozen = useContext(FreezeContext);
  const effect = resolveConcreteTransition(settings.transition, slide.itemId);
  const [tracked, setTracked] = useState<ImageSlideInfo>(slide);
  const [leaving, setLeaving] = useState<{ info: ImageSlideInfo; effect: SlideshowConcreteTransition | "none" } | null>(null);

  if (tracked.key !== slide.key) {
    setLeaving(effect === "none" ? null : { info: tracked, effect });
    setTracked(slide);
  }

  useEffect(() => {
    if (!leaving) return;
    const timeoutId = setTimeout(() => setLeaving(null), settings.transitionMs + SLIDE_LEAVE_CLEANUP_MARGIN_MS);
    return () => clearTimeout(timeoutId);
  }, [leaving, settings.transitionMs]);

  return (
    <div className="absolute inset-0 overflow-hidden">
      {leaving && (
        <ImageSlideLayer
          key={leaving.info.key}
          info={leaving.info}
          role="leaving"
          effect={leaving.effect}
          transitionMs={settings.transitionMs}
          settings={settings}
          objectFitClassName={objectFitClassName}
          showBlurFill={showBlurFill}
          single={false}
          paused={frozen}
        />
      )}
      <ImageSlideLayer
        key={slide.key}
        info={slide}
        role="current"
        effect={effect}
        transitionMs={settings.transitionMs}
        settings={settings}
        objectFitClassName={objectFitClassName}
        showBlurFill={showBlurFill}
        single={single}
        paused={frozen}
      />
    </div>
  );
}
