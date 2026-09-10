"use client";

import { useContext, useEffect, useRef, useState } from "react";
import { Clock, MapPin } from "lucide-react";
import { Progress } from "@venore/plugin-sdk/ui";
// Importa direto de contracts/ e shared/, nunca do barrel (@/plugins/broadcast) — este é um "use
// client" component, e o barrel reexporta handlers server-only (Drizzle/pg) que quebram o bundle
// do browser mesmo quando só o tipo é usado aqui (achado real do `next build`, não teórico).
import { resolveLayerGeometry, type LayerGeometry } from "../../shared/layer-geometry";
import { resolveOutputStageTransform } from "../../shared/output-stage";
import {
  BROADCAST_AGENDA_VIEW_SIZE_SCALE,
  type BroadcastAgendaAnimationStyle,
  type BroadcastAgendaViewSize,
} from "../../shared/settings";
import { isEventHappeningNow } from "../../shared/weekly-recurrence";
import { isSameZonedCalendarDay } from "../../shared/timezone";
import { resolveContrastPalette } from "./contrast-palette";
import { FreezeContext, NowPlayingContext, SyncContext } from "./now-playing-context";
import {
  DEFAULT_AGENDA_BACKGROUND,
  TV_ACCENT_COLOR,
  TV_ACCENT_COLOR_SOFT,
  TV_ACCENT_FOREGROUND,
  TV_ALERT_GRADIENT,
  TV_HAPPENING_NOW_COLOR,
  TV_HAPPENING_NOW_FOREGROUND,
} from "./tv-tokens";
import { StandbyScreen } from "./standby-screen";
import type {
  AgendaRotationEntry,
  AgendaRotationEvent,
  BroadcastLayerRecord,
  PlaylistItemSummary,
  RegionNewsArticle,
  RegionWeather,
} from "../../contracts/types";

function readString(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// config.agendaOpenVariant é a geometria que a camada "video" assume quando drawerOpen=true (a
// coluna de agenda está aberta, então o vídeo encolhe pra abrir espaço) — mesmo mecanismo
// genérico de resolveLayerGeometry que já existia (era "abrir uma gaveta de informações" na Fase
// 5 original), só reaproveitado: agora toda saída nasce com isso auto-configurado (ver
// create-output/store.ts), o operador nunca escreve esse JSON à mão.
function readGeometry(config: Record<string, unknown>): Partial<LayerGeometry> | undefined {
  const value = config.agendaOpenVariant;
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  const geometry: Partial<LayerGeometry> = {};
  for (const key of ["x", "y", "width", "height"] as const) {
    if (typeof record[key] === "number") geometry[key] = record[key] as number;
  }
  return geometry;
}

// Sobrescreve a largura da agenda (e o quanto o vídeo encolhe pra abrir espaço) a partir do
// percentual já resolvido por useZeroBarAgendaWidthPercent (estático ou medido em tempo real),
// ignorando o x/width gravado por saída na criação (create-output/store.ts) — assim um ajuste de
// tamanho vale pra saídas já existentes também, não só pras criadas depois de mudar a
// configuração.
//
// O drawer EMPURRA o vídeo (encolhe a caixa dele, ancorada em x=0), não sobrepõe — tentativa de
// virar overlay foi revertida (pedido explícito: "deve empurrar o vídeo e não deve estar sobre o
// footer" — o footer mora DENTRO da caixa do vídeo, ver VideoZoneLayer, então um overlay de agenda
// cobrindo a largura toda também cobria a fatia do footer que caía sob ele).
//
// Agenda fechada não é mais "sem largura nenhuma calculada" — vira x:100/width:0 (colapsada,
// encostada na borda direita) em vez de deixar a geometria como veio do banco. Isso é o que dá a
// animação de entrada/saída (pedido explícito: "inclua animação de entrada e saída para o
// drawer"): LayerRenderer não desmonta mais a camada "agenda" ao fechar (ver comentário lá), então
// a transição CSS já aplicada em todo LayerRenderer (GEOMETRY_TRANSITION) anima x/width sozinha
// entre as duas geometrias — sem overlay, sem JS extra pra abrir/fechar.
function applyAgendaViewSizeOverride(
  layer: BroadcastLayerRecord,
  geometry: LayerGeometry,
  drawerOpen: boolean,
  agendaWidthPercent: number,
): LayerGeometry {
  if (layer.type === "agenda") {
    return drawerOpen
      ? { ...geometry, x: 100 - agendaWidthPercent, width: agendaWidthPercent }
      : { ...geometry, x: 100, width: 0 };
  }
  if (!drawerOpen || layer.type !== "video") return geometry;
  return { ...geometry, width: 100 - agendaWidthPercent };
}

// Largura da agenda recalculada a partir da resolução REAL da tela — pedido explícito: "não quero
// espaços pretos" na view do vídeo, com piso de ~1/4 da tela ("a barra da agenda deve ter no
// mínimo aproximadamente 1/4 da tela... para manter a área de view sem faixas pretas"). A caixa do
// vídeo só fecha exatamente 16:9 quando a largura que a agenda tira (em %) bate matematicamente
// com a altura que o footer tira (em %) — a mesma tela perde largura pro lado da agenda e altura
// pro footer, e pra zerar a barra preta os dois precisam se cancelar (agendaWidthPercent =
// footerHeightPx / videoZoneHeight, assumindo tela 16:9).
//
// A conta roda em COORDENADAS DO PALCO (ver shared/output-stage.ts), não em px físicos: a view
// toda é composta contra OUTPUT_STAGE_WIDTH_PX e escalada pro viewport, então footerHeightPx
// (BROADCAST_AGENDA_VIEW_SIZE_SCALE) já é a altura renderizada em px do palco — h-20/h-32 valem
// exatamente esse tanto lá dentro. resolveOutputStageTransform(screen.width, screen.height) só
// normaliza a proporção física do monitor pra largura fixa do palco. Efeito colateral desejado:
// a largura da agenda passa a ser IDÊNTICA em 720p/1080p/4K (todos 16:9), em vez de variar com a
// resolução física — antes a conta misturava screen.height físico com um footerHeightPx calibrado
// pra 1080, e só "acertava" em 1920x1080 (nas outras o piso de 30% acabava mascarando o erro).
//
// window.screen.width/height (resolução FÍSICA do monitor), não window.innerWidth/innerHeight
// (viewport do browser) — innerHeight muda quando a barra de endereço/abas some/aparece (ex:
// apertar F11), fazendo a conta oscilar mesmo sem a tela física mudar. Achado real: "quando aperto
// F11 a agenda não deve diminuir" — innerHeight crescendo ao esconder o chrome do browser mudava o
// resultado da conta a cada toggle de fullscreen. screen.width/height é o mesmo valor com ou sem
// F11 (é o monitor, não a janela), então o cálculo fica estável — e numa TV/kiosk real (sem chrome
// de browser pra esconder) o comportamento já era assim de qualquer forma.
//
// Clampada entre o piso de 25% (agenda nunca fica menor que isso, mesmo que a conta desse um valor
// menor) e o teto configurado no tier (agendaWidthPercent de BROADCAST_AGENDA_VIEW_SIZE_SCALE — a
// agenda nunca fica MAIS larga que o admin pediu). O piso tem prioridade sobre o teto (Math.max
// aplicado por último) — se algum tier tiver agendaWidthPercent < 25 (não deveria, ver
// BROADCAST_AGENDA_VIEW_SIZE_SCALE), o piso ainda garante o mínimo pedido. Com o footer FECHADO
// (footerHeightPx efetivo = 0) a conta tende a 0%, então o piso passa a ser quem define a largura.
//
// SSR-safe (começa no valor estático do tier, igual ao que o server já mandou pronto — mesmo
// racional de useClock) e evita o padrão que react-hooks/set-state-in-effect sinaliza: a primeira
// medição roda num setTimeout(0) em vez de síncrona no corpo do efeito (mesma técnica de
// TimedProgressFill/VideoProgressFill acima — setState só de dentro de um callback assíncrono,
// nunca como a primeira linha do efeito).
function useZeroBarAgendaWidthPercent(agendaViewSize: BroadcastAgendaViewSize, footerOpen: boolean, active: boolean): number {
  const staticPercent = BROADCAST_AGENDA_VIEW_SIZE_SCALE[agendaViewSize].agendaWidthPercent;
  const [percent, setPercent] = useState(staticPercent);
  const MIN_AGENDA_WIDTH_PERCENT = 30;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const recompute = () => {
      if (cancelled) return;
      // Proporção física do monitor normalizada pra largura do palco (ver o comentário do bloco
      // acima e shared/output-stage.ts) — `scale` é ignorado aqui, só a régua de composição
      // (stageWidthPx/stageHeightPx) importa.
      const { stageWidthPx, stageHeightPx } = resolveOutputStageTransform(window.screen.width, window.screen.height);
      const footerHeightPx = footerOpen ? BROADCAST_AGENDA_VIEW_SIZE_SCALE[agendaViewSize].footerHeightPx : 0;
      const videoZoneHeightPx = stageHeightPx - footerHeightPx;
      const zeroBarVideoWidthPx = videoZoneHeightPx * (16 / 9);
      const computedPercent = ((stageWidthPx - zeroBarVideoWidthPx) / stageWidthPx) * 100;
      setPercent(Math.max(MIN_AGENDA_WIDTH_PERCENT, Math.min(staticPercent, computedPercent)));
    };
    const timeoutId = setTimeout(recompute, 0);
    window.addEventListener("resize", recompute);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("resize", recompute);
    };
  }, [agendaViewSize, footerOpen, active, staticPercent]);

  return percent;
}

// Duração/easing da transição de geometria é comportamento próprio do plugin (não decisão de
// design de marca — AGENTS.md seção 3 trata disso pra tokens shadcn/globals.css, não pra
// animação operacional de um canvas de saída que nem passa pelo tema), por isso vive como
// constante aqui, não em theme.css. Cor branca/preta neste arquivo é sempre inline `style`, nunca
// `className` — é overlay fixo sobre vídeo, não deve variar com o tema shadcn do admin (mesmo
// racional de layer "text" usar config.color por instância).
// opacity entra na mesma transição — usada só pela camada "agenda" (fade junto do slide ao abrir/
// fechar o drawer, ver LayerRenderer); as demais camadas ficam sempre opacity:1, então o valor
// nunca muda pra elas e a propriedade extra na lista não tem efeito nenhum.
const GEOMETRY_TRANSITION = "left 400ms ease, top 400ms ease, width 400ms ease, height 400ms ease, opacity 400ms ease";
// Mesma duração de GEOMETRY_TRANSITION — a entrada dos eventos da agenda (AgendaLayer) só começa
// depois que o drawer termina de abrir, não ao mesmo tempo (pedido explícito: "inicia a animação
// dos eventos só após terminar a animação do drawer"). Usado como animation-delay base do bloco
// "fade" e somado ao delay escalonado de cada card no "cascade".
const AGENDA_ENTRY_ANIMATION_DELAY_MS = 400;
// Altura (px, no palco de composição de 1920 — ver output-stage.ts) da barra de marca compacta
// (drawer fechado, BrandFooterBar `compact`) — precisa bater com a classe `h-24` usada lá (96px =
// 6rem), porque PlaylistLayer usa este número pra deslocar a barra de progresso pra cima do footer,
// que sobrepõe a base da view nesse modo (ver VideoZoneLayer). Par className+px, mesmo padrão de
// BROADCAST_AGENDA_VIEW_SIZE_SCALE. Dobrado de 48 pra 96 — pedido explícito: a barra compacta
// estava "praticamente ilegível".
const COMPACT_FOOTER_HEIGHT_PX = 96;
// Rotação interna de manchete dentro de um bloco de notícias (tanto a layer "news" standalone
// quanto o slide "news" dentro da playlist usam o mesmo componente/timer). O teto do bloco inteiro
// (quantos segundos o slide "news" fica no ar dentro do rodízio da playlist) é outra coisa — vem
// de PlaylistItemSummary.durationSeconds (editável por item, default DEFAULT_NEWS_BLOCK_DURATION_
// SECONDS em shared/playback-defaults.ts), não uma constante fixa aqui.
const NEWS_ARTICLE_ROTATION_MS = 6000;

// Assina um timer que dispara onDone repetidamente a cada durationMs — usado por item de playlist
// "imagem"/"webpage" (duração fixa), pela troca de card de notícia e pelo rodízio de agenda. Nunca
// seta estado síncrono no corpo do efeito (react-hooks/set-state-in-effect): só assina o timer, o
// setState acontece no callback. onDone fica numa ref (não nas deps do efeito) pra não precisar
// remontar o timer a cada render só porque o closure mudou de identidade.
//
// Se reagenda sozinho de dentro do próprio callback do timeout (em vez de um único setTimeout cuja
// dependência é [durationMs, active]) — bug real encontrado: com uma dependência fixa, dois ciclos
// consecutivos com a MESMA duração (ex: duas agendas de 5s, o intervalo fixo de troca de manchete,
// ou até um rodízio de um item só) nunca fazem o efeito reexecutar depois do primeiro avanço,
// porque nem durationMs nem active mudam de valor — o timer dispara uma vez, avança o índice, e
// trava pra sempre no item seguinte (sintoma relatado: "a primeira agenda entra, a segunda não
// alterna mais"). Reagendar de dentro do callback funciona pra qualquer duração/quantidade de
// itens, sem depender de nenhum valor externo mudar entre ciclos.
//
// resetKey é opcional — usado pelo avanço manual por clique (pedido explícito: "se clicar na view
// muda o vídeo, se clicar na agenda muda a agenda"): incrementar o contador reinicia a contagem
// automática do zero a partir do clique, em vez de deixar o timer automático (que continuaria
// contando desde o ciclo anterior) disparar de novo logo em seguida e "engolir" um item.
// Exportado pra output-canvas.tsx reaproveitar no scheduler de pausa entre agendas
// (useAgendaRotationSchedule) — mesmo mecanismo, evita reimplementar o reagendamento recursivo.
export function useTimedAdvance(durationMs: number, onDone: () => void, active = true, resetKey: number = 0) {
  const onDoneRef = useRef(onDone);

  // Ref só é escrita dentro de efeito (nunca durante o render — react-hooks/refs), roda depois de
  // todo render pra manter a ref sempre com o closure mais recente.
  useEffect(() => {
    onDoneRef.current = onDone;
  });

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;
    const scheduleNext = () => {
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        onDoneRef.current();
        scheduleNext();
      }, durationMs);
    };
    scheduleNext();
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [durationMs, active, resetKey]);
}

type PlaylistSlide =
  | { key: string; kind: "video"; itemId: string; withAudio: boolean }
  | { key: string; kind: "image"; itemId: string; durationSeconds: number }
  | { key: string; kind: "webpage"; url: string; durationSeconds: number; withAudio: boolean }
  | { key: string; kind: "news"; durationSeconds: number }
  | { key: string; kind: "agenda-event"; durationSeconds: number; event: AgendaRotationEvent | null };

// "news" já chega aqui como mais um item da playlist (sourceType "news", posição/duração próprias
// no admin) — não é mais injetado à parte no fim do rodízio. O texto/imagem de cada manchete vem
// de regionNews (resolvido uma vez por saída), o slide só decide por quanto tempo o bloco inteiro
// fica no ar antes de avançar pro próximo item. "agenda-event" (um único evento "em destaque", não
// a agenda inteira — pedido explícito) já chega com o evento resolvido em item.event (get-output-
// state), o slide só carrega adiante.
function buildPlaylistSlides(items: PlaylistItemSummary[]): PlaylistSlide[] {
  return items.map((item) =>
    item.kind === "video"
      ? { key: item.id, kind: "video", itemId: item.id, withAudio: item.withAudio }
      : item.kind === "image"
        ? { key: item.id, kind: "image", itemId: item.id, durationSeconds: item.durationSeconds ?? 15 }
        : item.kind === "webpage"
          ? { key: item.id, kind: "webpage", url: item.url ?? "", durationSeconds: item.durationSeconds ?? 60, withAudio: item.withAudio }
          : item.kind === "news"
            ? { key: item.id, kind: "news", durationSeconds: item.durationSeconds ?? 30 }
            : { key: item.id, kind: "agenda-event", durationSeconds: item.durationSeconds ?? 20, event: item.event },
  );
}

// Progresso do item atual (0-100), pra barra de progresso (ver PlaylistLayer) — vídeo usa
// timeupdate/loadedmetadata reais do <video> (currentTime/duration), os demais tipos (imagem/
// webpage/notícia) usam a mesma duração fixa que useTimedAdvance já lê pra decidir quando avançar,
// só que aqui tickando visualmente (~8x/s) em vez de só disparar uma vez no fim. Pedido explícito:
// "use a barra de progress do shadcn para indicar o tempo de execução daquele elemento. Seja
// vídeo, seja página, etc.".
//
// Reset ao trocar de slide/clique manual é feito por REMOUNT (key na chamada em PlaylistLayer),
// não por um setPercent(0) síncrono no corpo do efeito — cada componente já nasce com percent=0,
// que é o próprio valor inicial de useState. Evita o padrão que react-hooks/set-state-in-effect
// sinaliza (setState síncrono logo na entrada do efeito, disparando um render em cascata extra).
function TimedProgressFill({ durationMs, bottomOffsetPx = 0 }: { durationMs: number; bottomOffsetPx?: number }) {
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    if (durationMs <= 0) return;
    const startedAt = Date.now();
    const interval = setInterval(() => {
      setPercent(Math.min(100, ((Date.now() - startedAt) / durationMs) * 100));
    }, 125);
    return () => clearInterval(interval);
  }, [durationMs]);

  return <ProgressOverlay percent={percent} bottomOffsetPx={bottomOffsetPx} />;
}

function VideoProgressFill({
  videoRef,
  bottomOffsetPx = 0,
}: {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  bottomOffsetPx?: number;
}) {
  const [percent, setPercent] = useState(0);

  // Poll do ref (não um listener de "timeupdate" preso ao elemento) — robusto a engine de TV que
  // estrangula/atrasa "timeupdate", e lê o ref fresco a cada tick. Mesmo padrão de TimedProgressFill.
  useEffect(() => {
    const interval = setInterval(() => {
      const el = videoRef.current;
      if (el && el.duration > 0) setPercent(Math.min(100, (el.currentTime / el.duration) * 100));
    }, 250);
    return () => clearInterval(interval);
  }, [videoRef]);

  return <ProgressOverlay percent={percent} bottomOffsetPx={bottomOffsetPx} />;
}

// Overlay fino, LARGURA CHEIA e rente à borda inferior do slide (sem padding/cantos arredondados —
// pedido explícito: "full width, sobreposta ao vídeo e não ocupando espaço do height"). Cores
// discretas de propósito (trilho quase invisível, indicador com opacidade reduzida) — a primeira
// versão usava TV_ACCENT_COLOR sólido e ficou "muito chamativa" (feedback direto). Trilho e cor do
// indicador vêm por style inline, nunca className, mesma convenção do resto deste arquivo
// (globals/no-restricted-syntax só permite cor crua fora de className).
//
// bottomOffsetPx sobe a barra pra cima do footer compacto quando ele sobrepõe a base da view
// (drawer fechado, ver VideoZoneLayer) — pedido explícito: "a barra de progresso fica escondida
// quando o vídeo fica full width [...] fixe ela no topo do footer". 0 (padrão) = rente à borda,
// igual sempre foi quando não há footer sobrepondo.
function ProgressOverlay({ percent, bottomOffsetPx = 0 }: { percent: number; bottomOffsetPx?: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0" style={{ bottom: bottomOffsetPx }}>
      <Progress
        value={percent}
        className="h-0.5 rounded-none *:data-[slot=progress-indicator]:rounded-none *:data-[slot=progress-indicator]:bg-(--tv-progress-color)"
        style={{ background: "rgba(255,255,255,0.12)", "--tv-progress-color": "rgba(244,176,0,0.6)" } as React.CSSProperties}
      />
    </div>
  );
}

// Item "webpage" da playlist — dashboards de terceiros num <iframe>. Três cuidados sobre o
// <iframe> cru:
//
// 1. sandbox mínimo: "allow-scripts allow-same-origin" é o suficiente pra um dashboard renderizar
//    (JS + acesso ao próprio storage/cookies de origem), sem liberar navegação da aba de topo,
//    popups, downloads nem autoplay com som — a TV nunca deve sair da página por causa de algo
//    dentro do frame.
// 2. referrerPolicy="no-referrer": não vaza a URL interna da saída (que carrega o token) pro site
//    embutido.
// 3. Fallback de falha de embed: muitos sites recusam ser enquadrados (X-Frame-Options / CSP
//    frame-ancestors) e o resultado é uma tela em branco parada pelos segundos inteiros do slide —
//    mesmo sintoma de "travou" que isEmptySlide já trata pra notícia/agenda vazia. Não há evento
//    de erro confiável pra esse bloqueio (o browser recusa por baixo, onError nem sempre dispara),
//    então além do onError tem um timeout: se o load não vier em WEBPAGE_LOAD_TIMEOUT_MS, trata
//    como falha e avança pro próximo item — reaproveita o mesmo advance()+manualTick do avanço
//    manual por clique (reinicia a contagem automática a partir daqui).
const WEBPAGE_LOAD_TIMEOUT_MS = 8000;

function WebpageSlide({ url, withAudio, onFailure }: { url: string; withAudio: boolean; onFailure: () => void }) {
  // onFailure numa ref (não nas deps do efeito) — mesmo padrão de useTimedAdvance: o timer não
  // remonta a cada render só porque o closure mudou de identidade.
  const onFailureRef = useRef(onFailure);
  useEffect(() => {
    onFailureRef.current = onFailure;
  });

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loaded) return;
    const timeoutId = setTimeout(() => onFailureRef.current(), WEBPAGE_LOAD_TIMEOUT_MS);
    return () => clearTimeout(timeoutId);
  }, [loaded]);

  return (
    <iframe
      src={url}
      className="h-full w-full border-0"
      title="Página web da playlist"
      sandbox="allow-scripts allow-same-origin"
      // Só quando o item está marcado "Tocar áudio na TV" — sem isto (padrão) a política de
      // autoplay do navegador já barra som vindo do frame; com isto, o frame pode tocar áudio
      // sozinho num navegador de TV/kiosk que permita autoplay.
      allow={withAudio ? "autoplay" : undefined}
      referrerPolicy="no-referrer"
      onLoad={() => setLoaded(true)}
      onError={() => onFailureRef.current()}
    />
  );
}

// Watchdog de travamento do <video> da playlist. Um <video> congela sem nunca disparar onEnded —
// buffer preso (engasgo do servidor local, conexão Range derrubada) OU imagem congelada com o
// relógio ainda andando (decoder da iGPU não sustenta o bitrate e dropa frames em massa). Quando
// isso acontecia a playlist ficava presa pra sempre — só voltava alternando offline/online
// (achado real numa TV, pior no arquivo maior/alto-bitrate). O watchdog checa a cada tick: relógio
// andou E não está dropando frame em massa E tem frame utilizável. Não -> tenta play(); de novo ->
// nudge de seek; 3ª vez (9s) -> pula pro próximo item.
const VIDEO_STALL_CHECK_MS = 3000;
// Frames dropados NUMA janela de tick (~3s a 24fps ≈ 72 frames) que já conta como "imagem
// travando", e a razão acumulada dropados/total que conta como "vídeo sofrendo o tempo todo".
const VIDEO_DROPPED_PER_TICK_LIMIT = 20;
const VIDEO_DROPPED_RATIO_LIMIT = 0.4;

// Fundo borrado do letterbox (drawer aberto): amostra o frame atual do <video> da frente num
// <canvas> pequeno a cada BLUR_SAMPLE_MS (~10fps, movimento real, um decoder só). Alvo estreito
// (o blur de 24px + o scale já escondem qualquer perda de resolução) — mantém o custo desprezível
// mesmo numa TV fraca.
const BLUR_SAMPLE_MS = 100;
const BLUR_CANVAS_WIDTH = 480;

// Encapsula o <video> da frente + a captura do frame borrado de fundo (blurredFill) + o watchdog.
// Vira um componente pra poder ter hooks próprios (o watchdog precisa de useEffect/useRef). O
// <video> continua com key={itemId} no chamador, então troca de item = remonta este componente
// inteiro (estado do watchdog zera junto, sem lógica de reset manual).
function VideoSlide({
  itemId,
  withAudio,
  loop,
  objectFitClassName,
  showBlurFill,
  videoRef,
  onEnded,
  onStuck,
}: {
  itemId: string;
  withAudio: boolean;
  // Único slide da playlist (só este vídeo): avançar cairia de volta nele mesmo e o setIndex vira
  // no-op — o <video> não remonta e fica preso no frame final (tela preta). `loop` nativo resolve;
  // com >1 slide o avanço troca de item normalmente e o loop não entra.
  loop: boolean;
  objectFitClassName: string;
  showBlurFill: boolean;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  onEnded: () => void;
  onStuck: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const onStuckRef = useRef(onStuck);
  useEffect(() => {
    onStuckRef.current = onStuck;
  });

  // O <video> toca em STREAMING direto da rota do plugin (public/broadcast/videos servido com
  // Range). Uma tentativa de baixar o arquivo inteiro pra um Blob antes de tocar foi descartada —
  // resolvia parte do travamento mas trazia ~2s de espera + placeholder a cada vídeo. Se o
  // travamento for engasgo do servidor ao servir o stream, a correção é do lado do servidor
  // (instrumentar a rota, ver docs/broadcast-plano-correcoes.md Fase 13); se for o decoder da TV
  // não segurar o bitrate, é re-encode do arquivo. O watchdog abaixo garante que, trave por qual
  // motivo for, o canal não fica preso.
  const streamUrl = `/api/broadcast/stream/${itemId}`;

  // Fundo borrado do letterbox: em vez de um 2º <video> tocando o MESMO arquivo (dois decodes de
  // hardware — numa TV com poucos decoders travava o vídeo da frente), amostra o frame ATUAL do
  // vídeo da frente num <canvas> pequeno (BLUR_CANVAS_WIDTH), ~BLUR_SAMPLE_MS. É movimento real
  // (é o próprio vídeo), com um decoder só. NÃO é um loop de rAF disputando com o playback (era
  // essa a preocupação do comentário antigo) — é um setInterval leve desenhando num alvo 480px.
  // Combinado com a deriva CSS lenta (broadcast-blur-drift) pra nunca parecer congelado num
  // soluço de amostragem ou enquanto o vídeo está pausado (ex: autoplay com som bloqueado).
  // drawImage em try/catch: se falhar, mantém o último frame bom; se nunca desenhar, o letterbox
  // fica na cor de marca do VideoZoneLayer (comportamento pré-blur).
  const drawBlurFrame = () => {
    if (!showBlurFill) return;
    const v = videoRef.current;
    const c = canvasRef.current;
    if (!v || !c || v.readyState < 2) return;
    try {
      const ratio = v.videoWidth > 0 ? v.videoHeight / v.videoWidth : 9 / 16;
      const w = BLUR_CANVAS_WIDTH;
      const h = Math.max(1, Math.round(w * ratio));
      if (c.width !== w || c.height !== h) {
        c.width = w;
        c.height = h;
      }
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(v, 0, 0, w, h);
      if (c.hidden) c.hidden = false;
    } catch {
      // mantém o último frame desenhado (ou o letterbox na cor de marca)
    }
  };

  // Ref pro timer não reassinar a cada render (mesmo padrão de onStuckRef acima) — drawBlurFrame
  // só lê refs, então a identidade nova a cada render não muda o comportamento.
  const drawBlurFrameRef = useRef(drawBlurFrame);
  useEffect(() => {
    drawBlurFrameRef.current = drawBlurFrame;
  });

  useEffect(() => {
    if (!showBlurFill) return;
    const id = setInterval(() => drawBlurFrameRef.current(), BLUR_SAMPLE_MS);
    return () => clearInterval(id);
  }, [showBlurFill]);

  useEffect(() => {
    let lastTime = -1;
    let lastDropped = 0;
    let strikes = 0;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v || v.ended) {
        strikes = 0;
        lastTime = v?.currentTime ?? -1;
        return;
      }

      const clockMoved = v.currentTime > lastTime + 0.05;
      lastTime = v.currentTime;

      // Imagem congelada com o relógio andando: getVideoPlaybackQuality (nem toda engine tem)
      // mostra os frames dropados. Muitos numa janela de tick, ou razão acumulada alta = decoder
      // não dá conta do bitrate.
      let framesDying = false;
      const quality = typeof v.getVideoPlaybackQuality === "function" ? v.getVideoPlaybackQuality() : null;
      if (quality) {
        const droppedThisTick = quality.droppedVideoFrames - lastDropped;
        lastDropped = quality.droppedVideoFrames;
        const droppedRatio = quality.totalVideoFrames > 0 ? quality.droppedVideoFrames / quality.totalVideoFrames : 0;
        framesDying = droppedThisTick > VIDEO_DROPPED_PER_TICK_LIMIT || droppedRatio > VIDEO_DROPPED_RATIO_LIMIT;
      }

      const healthy = clockMoved && !framesDying && v.readyState >= 2;
      if (healthy) {
        strikes = 0;
        return;
      }

      strikes += 1;
      if (strikes === 1) {
        void v.play().catch(() => {});
      } else if (strikes === 2) {
        // Nudge de seek — destrava um pipeline preso sem reiniciar o vídeo do zero (o load() de
        // antes recomeçava um vídeo de 2min lá do começo). Não ajuda o caso "decoder não sustenta
        // o bitrate", mas nesse caso o 3º strike já pula.
        try {
          v.currentTime = v.currentTime + 0.1;
          void v.play().catch(() => {});
        } catch {
          // ignora — o próximo strike pula o item
        }
      } else {
        strikes = 0;
        onStuckRef.current();
      }
    }, VIDEO_STALL_CHECK_MS);
    return () => clearInterval(id);
  }, [videoRef, itemId]);

  return (
    <>
      {showBlurFill && (
        // A deriva CSS (broadcast-blur-drift, no <style> de output-canvas.tsx) mantém movimento
        // mesmo entre amostras / enquanto o vídeo está pausado — a animação já inclui o scale
        // base (>1) que o blur precisa pra não mostrar borda transparente.
        <canvas
          ref={canvasRef}
          hidden
          aria-hidden
          className="pointer-events-none absolute inset-0 h-full w-full"
          style={{ filter: "blur(24px) brightness(0.6)", animation: "broadcast-blur-drift 24s ease-in-out infinite alternate" }}
        />
      )}
      <video
        ref={videoRef}
        className={`relative h-full w-full ${objectFitClassName}`}
        src={streamUrl}
        autoPlay
        loop={loop}
        // Item marcado "Tocar áudio na TV" (with_audio) sai sem mute; senão, muted (exigência de
        // autoplay do navegador). Se o navegador recusar o autoplay com som, volta pra reprodução
        // muda — nunca deixa a playlist travada num vídeo que não começou.
        muted={!withAudio}
        playsInline
        onLoadedData={(event) => {
          drawBlurFrame();
          if (withAudio) {
            const el = event.currentTarget;
            el.play().catch(() => {
              el.muted = true;
              void el.play();
            });
          }
        }}
        onError={() => onStuckRef.current()}
        onEnded={onEnded}
      />
    </>
  );
}

function PlaylistLayer({
  items,
  newsArticles,
  fillMode = "contain",
  progressBarBottomOffsetPx = 0,
  timeZone,
  brandLogoUrl,
}: {
  items: PlaylistItemSummary[];
  newsArticles: RegionNewsArticle[];
  // "cover" preenche a caixa cortando o excesso — usado só com o drawer fechado (ver
  // VideoZoneLayer): a caixa já É a tela inteira ali, então cortar levemente é o comportamento
  // esperado de "fullscreen" (pedido explícito: "quando o drawer/agenda some o vídeo deve ficar
  // full screen" — sem barra nenhuma). "contain" (default, drawer aberto) preserva a proporção do
  // arquivo com barras pretas — a caixa do vídeo não é mais 16:9 quando a agenda abre, e cortar
  // agressivamente nesse caso já causou reclamação real ("a view do vídeo precisa permanecer
  // 16:9, o vídeo está cortando para a esquerda").
  fillMode?: "contain" | "cover";
  // Desloca a barra de progresso pra cima do footer compacto (que sobrepõe a base da view em
  // overlay quando o drawer está fechado, ver VideoZoneLayer/BrandFooterBar) — sem isso a barra
  // ficava colada no bottom:0 da própria caixa, e o footer (fundo sólido, DOM depois dela) pintava
  // por cima e a escondia. 0 (padrão) quando não há footer compacto sobrepondo.
  progressBarBottomOffsetPx?: number;
  // Fuso da instituição — repassado ao FeaturedAgendaEventSlide (formatação da data/hora do evento).
  timeZone: string;
  // Logo do site — assinatura no rodapé da StandbyScreen "no-content" (playlist sem item
  // resolvível OU sem nenhum vídeo). Pode vir null quando o footer está fechado e a saída não está
  // offline (get-output-state só resolve a marca sob essas condições) — a StandbyScreen fica só
  // com texto nesse caso. As CORES da StandbyScreen vêm do tema, não daqui.
  brandLogoUrl: string | null;
}) {
  const [index, setIndex] = useState(0);
  // Incrementado a cada avanço manual por clique — vira resetKey de useTimedAdvance, reiniciando a
  // contagem automática a partir do clique (ver comentário na definição do hook).
  const [manualTick, setManualTick] = useState(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const slides = buildPlaylistSlides(items);

  // Reprodução sincronizada de grupo (v1.8): quando não-null, o índice vem do servidor (sync.
  // itemIndex) e o avanço vira um POST em /api/broadcast/output/<token>/sync-advance — o servidor
  // avança o cursor e manda "sync-changed", e a TV pega o item novo no refetch. syncReportedForRef
  // garante um report por item (onEnded + watchdog não spammam).
  const sync = useContext(SyncContext);
  const syncReportedForRef = useRef<string | null>(null);
  const reportSyncEnd = (itemId: string) => {
    if (!sync || syncReportedForRef.current === itemId) return;
    syncReportedForRef.current = itemId;
    void fetch(`/api/broadcast/output/${sync.token}/sync-advance`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ itemId }),
      keepalive: true,
    }).catch(() => {});
  };
  // O canal é essencialmente vídeo: uma tela sem playlist cadastrada (items vazio), ou com uma
  // playlist que não tem NENHUM item de vídeo (só imagem/página/notícia/evento), cai na tela de
  // espera branded em vez de rodar esses itens — pedido explícito. `slides` vazio já cobria o
  // primeiro caso; `hasPlayableVideo` cobre o segundo.
  const hasPlayableVideo = slides.some((slide) => slide.kind === "video");

  // Índice efetivo: do servidor quando sincronizado (clamp pra não estourar se a playlist mudou
  // entre o cursor e este refetch), local caso contrário.
  const effectiveIndex = sync ? Math.min(Math.max(sync.itemIndex, 0), Math.max(slides.length - 1, 0)) : index % Math.max(slides.length, 1);
  const advance = () => setIndex((previous) => (previous + 1) % slides.length);
  const current = slides.length > 0 ? slides[effectiveIndex] : null;
  // Bloco de notícias sem nenhuma manchete, ou evento "em destaque" cujo evento referenciado sumiu
  // (apagado depois do item ter sido criado na playlist — ver classifyPlaylistItem), não têm o que
  // mostrar — sem isso, ficava um texto apagado sobre tela preta pelos segundos inteiros
  // configurados, fácil de confundir com "travou" vendo de longe (achado real relatado numa TV
  // pro caso de notícias). Some rápido (1s) e segue pro próximo item em vez de ocupar o tempo todo
  // sem nada.
  const isEmptySlide =
    (current?.kind === "news" && newsArticles.length === 0) || (current?.kind === "agenda-event" && !current.event);
  const timedDurationMs = current && current.kind !== "video" ? (isEmptySlide ? 1000 : current.durationSeconds * 1000) : 0;
  const timedActive = current !== null && current.kind !== "video";

  // "Congelar" (output.frozen, via FreezeContext) — trava o item atual: nem o timer avança, nem o
  // fim do vídeo. Volta a rodar quando o admin descongela (evento SSE traz frozen=false).
  const frozen = useContext(FreezeContext);
  // Fim do item: congelado não faz nada; sincronizado avisa o servidor (não avança sozinho);
  // normal avança o índice local.
  const onItemEnd = () => {
    if (frozen) return;
    // items e slides são 1:1; items[effectiveIndex].id é o id real do item pra qualquer kind.
    if (sync) reportSyncEnd(items[effectiveIndex]?.id ?? sync.itemId);
    else advance();
  };
  useTimedAdvance(timedDurationMs, onItemEnd, timedActive && !frozen, manualTick);
  const advanceUnlessFrozen = onItemEnd;

  // Seek do vídeo pra bater o relógio do grupo (abordagem A): ao receber um sync novo (itemId /
  // elapsedMs) e a cada ~10s pra corrigir deriva. `elapsedMs` é "há quanto tempo o item começou"
  // medido no servidor; ancoramos num relógio MONOTÔNICO local (performance.now) a partir daí, sem
  // comparar relógio de máquinas (evita erro de skew de NTP). Só pra item de vídeo.
  const syncAnchorRef = useRef({ atPerfMs: 0, elapsedMs: 0 });
  useEffect(() => {
    if (!sync) return;
    syncAnchorRef.current = { atPerfMs: performance.now(), elapsedMs: sync.elapsedMs };
  }, [sync?.itemId, sync?.elapsedMs, sync]);

  useEffect(() => {
    if (!sync || current?.kind !== "video") return;
    const seekToClock = () => {
      const video = videoRef.current;
      if (!video || video.readyState < 1 || !Number.isFinite(video.duration) || video.duration <= 0) return;
      const anchor = syncAnchorRef.current;
      const expected = (anchor.elapsedMs + (performance.now() - anchor.atPerfMs)) / 1000;
      if (expected < 0 || expected >= video.duration - 0.4) return;
      if (Math.abs(video.currentTime - expected) > 1.5) {
        try {
          video.currentTime = expected;
        } catch {
          // seek pode falhar se o buffer ainda não cobre o ponto — a próxima passada tenta de novo
        }
      }
    };
    seekToClock();
    const onMeta = () => seekToClock();
    videoRef.current?.addEventListener("loadedmetadata", onMeta);
    const drift = setInterval(seekToClock, 10_000);
    return () => {
      clearInterval(drift);
      videoRef.current?.removeEventListener("loadedmetadata", onMeta);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sync?.itemId, sync?.elapsedMs, current?.kind]);

  // Item novo no cursor do grupo → libera um novo report de "acabou".
  useEffect(() => {
    syncReportedForRef.current = null;
  }, [sync?.itemId]);

  // Reporta "qual item toca agora" pro beacon de telemetria (via NowPlayingContext, provido pelo
  // OutputCanvas). items e slides são 1:1, então items[index] casa com `current`.
  const reportNowPlaying = useContext(NowPlayingContext);
  const nowPlayingItem = items.length > 0 ? (items[effectiveIndex] ?? null) : null;
  useEffect(() => {
    if (!reportNowPlaying) return;
    reportNowPlaying(
      nowPlayingItem
        ? { index: effectiveIndex + 1, count: items.length, label: nowPlayingItem.label, itemId: nowPlayingItem.id }
        : null,
    );
    return () => reportNowPlaying(null);
  }, [reportNowPlaying, effectiveIndex, items, items.length, nowPlayingItem]);

  // Sem item resolvível, ou sem nenhum vídeo na playlist — tela de espera branded "nenhum
  // conteúdo" no lugar do texto cru sobre tela preta (Fase 11).
  if (!current || !hasPlayableVideo) {
    return <StandbyScreen reason="no-content" brandLogoUrl={brandLogoUrl} />;
  }

  // fillMode decide object-contain (letterbox, drawer aberto) vs object-cover (preenche cortando
  // o excesso, drawer fechado/fullscreen) — ver o racional completo na prop acima. Com "contain",
  // a sobra do letterbox NÃO fica preta: um segundo <video>/<img> borrado atrás preenche a caixa
  // (ver blurredFill logo abaixo). `relative` no elemento da frente garante que ele pinte por cima
  // desse fundo absoluto (ambos z-index auto, ordem no DOM decide — o da frente vem depois).
  const objectFitClassName = fillMode === "cover" ? "object-cover" : "object-contain";
  const content =
    current.kind === "video" ? (
      <VideoSlide
        key={current.key}
        itemId={current.itemId}
        withAudio={current.withAudio}
        loop={slides.length === 1}
        objectFitClassName={objectFitClassName}
        showBlurFill={fillMode === "contain"}
        videoRef={videoRef}
        onEnded={advanceUnlessFrozen}
        onStuck={() => {
          onItemEnd();
          setManualTick((tick) => tick + 1);
        }}
      />
    ) : current.kind === "image" ? (
      // fonte é a rota de stream do plugin (arquivo local ou Blob), não um asset estático do bundle.
      // eslint-disable-next-line @next/next/no-img-element
      <img key={current.key} src={`/api/broadcast/stream/${current.itemId}`} alt="" className={`relative h-full w-full ${objectFitClassName}`} />
    ) : current.kind === "webpage" ? (
      <WebpageSlide
        key={current.key}
        url={current.url}
        withAudio={current.withAudio}
        onFailure={() => {
          onItemEnd();
          setManualTick((tick) => tick + 1);
        }}
      />
    ) : current.kind === "news" ? (
      <NewsCardRotator key={current.key} articles={newsArticles} />
    ) : (
      <FeaturedAgendaEventSlide
        key={current.key}
        event={current.event}
        durationSeconds={current.durationSeconds}
        timeZone={timeZone}
      />
    );

  // Fim da faixa preta com o drawer aberto. Quando fillMode é "contain" a caixa do vídeo deixa de
  // ser 16:9 (a coluna de agenda empurrou), então o object-contain do slide da frente letterboxa
  // um vídeo/imagem 16:9 e sobra faixa. Em vez de deixar essa sobra preta, um fundo borrado
  // preenche a caixa inteira. Vídeo: o fundo é um SNAPSHOT do primeiro frame num <canvas> (dentro
  // do VideoSlide) — antes era um 2º <video> tocando o mesmo arquivo, mas dois decodes do mesmo
  // stream numa TV com poucos decoders de hardware travava o vídeo da frente (o de fundo seguia
  // tocando). Imagem: continua um <img> (não compete por decoder de vídeo). "webpage"/"news"/
  // "agenda-event" já são full-bleed. Drawer fechado (fillMode "cover"): nada disso monta.
  const blurredFill =
    fillMode === "contain" && current.kind === "image" ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        key={`${current.key}-fill`}
        src={`/api/broadcast/stream/${current.itemId}`}
        alt=""
        aria-hidden
        className="pointer-events-none absolute inset-0 h-full w-full object-cover"
        style={{ filter: "blur(24px) brightness(0.6)", transform: "scale(1.1)" }}
      />
    ) : null;

  // Clicável quando há mais de um item — pedido explícito: "se clicar na view muda o vídeo". Uma
  // camada transparente por cima (não onClick direto no <video>/<iframe>) garante o mesmo
  // comportamento pra qualquer tipo de slide, inclusive "webpage" (um clique dentro de um <iframe>
  // nunca borbulha pro elemento pai — é outro documento).
  // overflow-hidden clipa o scale(1.1) do blurredFill (e já era o comportamento efetivo — os
  // wrappers de LayerRenderer/VideoZoneLayer acima também recortam).
  return (
    <div className="relative h-full w-full overflow-hidden">
      {blurredFill}
      {content}
      {slides.length > 1 && !sync && (
        <div
          role="button"
          aria-label="Avançar para o próximo item da playlist"
          onClick={() => {
            advance();
            setManualTick((tick) => tick + 1);
          }}
          className="absolute inset-0 cursor-pointer"
        />
      )}
      {/* Barra de progresso (shadcn Progress) indicando quanto falta pro item atual da playlist
          avançar — vídeo usa o tempo real de reprodução, os outros tipos (imagem/webpage/notícia)
          usam a duração configurada. key força remount (e reset de percent pra 0) a cada troca de
          slide ou clique manual (manualTick) — ver comentário em TimedProgressFill acima. */}
      {current.kind === "video" ? (
        // Sufixo "-progress" evita colidir com a key de `content` acima (mesmo current.key, mesmo
        // pai) — duas keys iguais entre irmãos faziam o React reportar "two children with the same
        // key" e arriscar duplicar/omitir um dos dois.
        <VideoProgressFill key={`${current.key}-progress`} videoRef={videoRef} bottomOffsetPx={progressBarBottomOffsetPx} />
      ) : (
        <TimedProgressFill
          key={`${current.key}-${manualTick}-progress`}
          durationMs={timedDurationMs}
          bottomOffsetPx={progressBarBottomOffsetPx}
        />
      )}
    </div>
  );
}

// Camada "video" (playlist principal) — o footer (BrandFooterBar) mora AQUI DENTRO agora, não mais
// como irmão de largura de tela cheia no canvas (output-canvas.tsx) — pedido explícito: "o Footer
// fica APENAS na parte da view do Vídeo, a Agenda vai do canto superior até o inferior". Empilhado
// em flex-col: playlist (flex-1) + footer (altura fixa do tier, shrink-0) — a agenda (AgendaLayer,
// caixa totalmente separada na geometria de LayerRenderer) nunca é afetada pela altura do footer.
//
// drawerOpen decide o MODO do footer, não só a agenda: com a agenda aberta, comportamento normal
// (footer empurra a playlist, altura do tier). Com a agenda fechada, pedido explícito: "a view do
// vídeo deve preencher toda a tela. O footer [...] pode sobrepor, mas com um height menor (quase
// como uma barra de tarefas)" — a playlist ocupa 100% da coluna e o footer vira um overlay
// absoluto compacto por cima, sem roubar altura do vídeo.
//
// <PlaylistLayer> SEMPRE fica na mesma posição/profundidade da árvore, único filho do MESMO
// wrapper (mesmo tipo de elemento, "div"), em vez de um `if (!drawerOpen) return <árvore A>;
// return <árvore B>` com PlaylistLayer em profundidades diferentes em cada árvore — bug real
// encontrado: abrir/fechar a agenda reiniciava o vídeo/playlist do zero, porque as duas árvores
// tinham formatos diferentes (branch fechado: PlaylistLayer filho direto do wrapper; branch
// aberto: PlaylistLayer dentro de uma div extra) e o React, ao trocar de branch, via um elemento
// de tipo diferente na mesma posição (era PlaylistLayer, virou uma div "min-h-0 flex-1" ou
// vice-versa) e desmontava/remontava tudo por baixo, incluindo o <video> real — perdendo
// currentTime e reiniciando a reprodução. Só className/style mudam por drawerOpen agora, nunca a
// FORMA da árvore — PlaylistLayer (e o <video>/<img> dentro dele, via seus próprios key={current.
// key} que não dependem de drawerOpen) nunca remonta só por causa do drawer abrir/fechar.
function VideoZoneLayer({
  items,
  newsArticles,
  footerOpen,
  brandLogoUrl,
  brandColor,
  weather,
  agendaViewSize,
  drawerOpen,
  tickerEnabled,
  agendaRotation,
  timeZone,
}: {
  items: PlaylistItemSummary[];
  newsArticles: RegionNewsArticle[];
  footerOpen: boolean;
  brandLogoUrl: string | null;
  brandColor: string;
  weather: RegionWeather | null;
  agendaViewSize: BroadcastAgendaViewSize;
  drawerOpen: boolean;
  tickerEnabled: boolean;
  agendaRotation: AgendaRotationEntry[];
  timeZone: string;
}) {
  // Footer compacto (drawer fechado) sobrepõe a base da view em vez de empurrá-la — a barra de
  // progresso precisa saber a altura dele pra não ficar escondida atrás (ver PlaylistLayer/
  // ProgressOverlay). Sem footer ali (footerOpen=false ou drawer aberto, onde o footer empurra em
  // vez de sobrepor), offset 0 — barra rente à borda, como sempre foi.
  const compactFooterVisible = !drawerOpen && footerOpen;

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${drawerOpen ? "flex flex-col" : ""}`}
      style={drawerOpen ? { background: brandColor } : undefined}
    >
      <div className={drawerOpen ? "min-h-0 flex-1 overflow-hidden" : "h-full w-full overflow-hidden"}>
        <PlaylistLayer
          items={items}
          newsArticles={newsArticles}
          fillMode={drawerOpen ? "contain" : "cover"}
          progressBarBottomOffsetPx={compactFooterVisible ? COMPACT_FOOTER_HEIGHT_PX : 0}
          timeZone={timeZone}
          brandLogoUrl={brandLogoUrl}
        />
      </div>
      {footerOpen && (
        <BrandFooterBar
          brandLogoUrl={brandLogoUrl}
          brandColor={brandColor}
          weather={weather}
          agendaViewSize={agendaViewSize}
          tickerEnabled={tickerEnabled}
          agendaRotation={agendaRotation}
          compact={!drawerOpen}
          timeZone={timeZone}
        />
      )}
    </div>
  );
}

// Barra de marca (logo + relógio + data + temperatura) — altura FIXA do tier (shrink-0, nunca
// flex-1), agora aninhada DENTRO da coluna de vídeo (ver VideoZoneLayer acima), não mais um irmão
// de largura de tela cheia — pedido explícito: "o Footer fica APENAS na parte da view do Vídeo".
// Tamanho de volta ao valor base por tier (sem crescimento dinâmico pra "caçar" 16:9 — chegava a
// ocupar ~30% da tela numa agenda larga; pedido explícito: "o footer pode ser menor, no tamanho
// que estava antes"). Alternável por saída (output.footerOpen) — quando fechada, esta função nem é
// montada (ver VideoZoneLayer), a playlist recupera 100% da altura da coluna de vídeo.
//
// Bloco relógio+data+clima, MESMA estrutura com o drawer aberto ou fechado — pedido explícito: "o
// layout do Relógio e Clima não deve alterar quando o drawer estiver off" (antes, a variante
// "compact" só mostrava hora+temperatura numa linha só, sem data nem o rótulo da condição do
// tempo). "Layout" ali é a ESTRUTURA (hora+data empilhados, clima com divisor+rótulo) — o TAMANHO
// do texto acompanha a altura da barra. Com a barra compacta dobrada pra h-24/96px
// (COMPACT_FOOTER_HEIGHT_PX) — perto do tier aberto `padrao` (h-20/80px) — o texto compacto usa os
// MESMOS tamanhos do modo aberto; antes, com a barra de 48px, ele precisava encolher e ficava
// ilegível de longe.
function ClockWeatherBlock({
  time,
  date,
  weather,
  palette,
  compact = false,
}: {
  time: string;
  date: string;
  weather: RegionWeather | null;
  palette: ReturnType<typeof resolveContrastPalette>;
  compact?: boolean;
}) {
  // compact só reduz o espaçamento lateral — os tamanhos de texto/ícone são os mesmos do modo
  // aberto (a barra compacta agora é alta o bastante, ver o comentário acima).
  return (
    <div className={`flex shrink-0 items-center ${compact ? "gap-4" : "gap-4 sm:gap-6"}`}>
      <div className="text-right leading-none">
        <div className="font-bold tracking-tight tabular-nums text-2xl" style={{ color: palette.foreground }}>
          {time}
        </div>
        <div className="mt-1.5 font-semibold capitalize text-lg" style={{ color: palette.muted }}>
          {date}
        </div>
      </div>
      {weather && (
        // UX "premium" — mesmo par tipográfico do horário ao lado (número grande em cima, rótulo
        // embaixo) em vez de só emoji+número soltos, pra ficar visualmente consistente com o resto
        // da barra. O rótulo (data / condição do tempo) usa text-lg semibold — pedido explícito:
        // "muito pequeno... aumentar e aumentar o peso" (era text-xs medium, ilegível de longe).
        <>
          <span aria-hidden="true" className="w-px shrink-0 h-8" style={{ background: palette.subtle }} />
          <div className="flex items-center gap-3">
            <span className="leading-none text-4xl">{weather.emoji}</span>
            <div className="text-left leading-none">
              <div className="font-bold tabular-nums text-2xl" style={{ color: palette.foreground }}>
                {Math.round(weather.temperatureC)}°
              </div>
              <div className="mt-1.5 font-semibold capitalize text-lg" style={{ color: palette.muted }}>
                {weather.conditionLabel}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// Ticker de agenda (tickerEnabled) mora DENTRO deste componente, na MESMA linha da logo e do
// relógio (não mais uma segunda linha abaixo) — pedido explícito: "o ticker deve ser rotativo
// dentro do footer, entre o brand e o relógio, alinhado à direita (junto do relógio)" (ver
// AgendaTickerInline). Continua herdando o mesmo escopo do footer — só aparece quando
// footerOpen=true, e só ocupa a largura do vídeo (não a da agenda), nunca a tela inteira.
export function BrandFooterBar({
  brandLogoUrl,
  brandColor,
  weather,
  agendaViewSize,
  tickerEnabled,
  agendaRotation,
  compact = false,
  timeZone,
}: {
  brandLogoUrl: string | null;
  brandColor: string;
  weather: RegionWeather | null;
  agendaViewSize: BroadcastAgendaViewSize;
  tickerEnabled: boolean;
  agendaRotation: AgendaRotationEntry[];
  compact?: boolean;
  timeZone: string;
}) {
  const now = useClock();
  const palette = resolveContrastPalette(brandColor);
  const time = now?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }) ?? "";
  const date = now?.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone }) ?? "";
  const { footerHeightClassName, footerLogoHeightClassName } = BROADCAST_AGENDA_VIEW_SIZE_SCALE[agendaViewSize];

  if (compact) {
    return (
      <div className="absolute inset-x-0 bottom-0 flex w-full shrink-0 flex-col" style={{ background: brandColor }}>
        {/* h-24 (COMPACT_FOOTER_HEIGHT_PX=96, os dois precisam bater — ver a constante). Era
            h-12/48px e ficou ilegível de longe; dobrado a pedido explícito. Logo e
            ClockWeatherBlock (compact) escalam junto — a ESTRUTURA do relógio/clima continua a
            mesma do modo aberto, só o tamanho do texto muda (pedido anterior: "o layout do Relógio
            e Clima não deve alterar quando o drawer estiver off" — layout = estrutura, não
            tamanho). */}
        <div className="flex h-24 w-full items-center justify-between gap-4 px-7">
          {brandLogoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- logo vem de contexts/media (Blob), domínio arbitrário.
            <img
              src={brandLogoUrl}
              alt=""
              className="h-12 w-auto shrink-0 object-contain"
              style={palette.isLight ? undefined : { filter: "brightness(0) invert(1)" }}
            />
          ) : (
            <span />
          )}
          {tickerEnabled && <AgendaTickerInline rotation={agendaRotation} palette={palette} timeZone={timeZone} />}
          {now && <ClockWeatherBlock time={time} date={date} weather={weather} palette={palette} compact />}
        </div>
      </div>
    );
  }

  return (
    <div className="flex w-full shrink-0 flex-col" style={{ background: brandColor }}>
      <div className={`flex ${footerHeightClassName} w-full items-center justify-between gap-4 px-7`}>
        {brandLogoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- logo vem de contexts/media (Blob), domínio arbitrário.
          <img
            src={brandLogoUrl}
            alt=""
            className={`${footerLogoHeightClassName} w-auto shrink-0 object-contain`}
            style={palette.isLight ? undefined : { filter: "brightness(0) invert(1)" }}
          />
        ) : (
          <span />
        )}
        {tickerEnabled && <AgendaTickerInline rotation={agendaRotation} palette={palette} timeZone={timeZone} />}
        {now && <ClockWeatherBlock time={time} date={date} weather={weather} palette={palette} />}
      </div>
    </div>
  );
}

// 2º redesenho — o 1º (fundo desfocado + imagem inteira object-contain) ainda ficava ruim porque
// o problema real não é o corte/esticamento, é que a manchete da NewsData.io vem numa miniatura
// pequena (às vezes ~150-300px) e qualquer tentativa de preencher uma faixa larga do card com ela
// (mesmo "contida") deixa evidente a baixa resolução. A correção é reduzir a imagem a uma miniatura
// pequena e bem emoldurada (moldura fixa ~30% de largura, cantos arredondados, sombra) em vez de
// tentar fazê-la "hero" — um recorte pequeno de uma imagem pequena não chama atenção pro
// pixelamento; o peso visual do card vira tipografia (título/descrição grandes), não a foto.
// Título/descrição entram com fade+slide (broadcast-news-title-in); a imagem tem um zoom lento
// (broadcast-news-parallax) — key={article.link} no chamador (NewsCardRotator) força remount a
// cada manchete, as animações re-disparam sozinhas. onError esconde a imagem se a URL da notícia
// não carregar (em vez do ícone de imagem quebrada do browser).
function NewsSlideCard({ article }: { article: RegionNewsArticle }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(article.imageUrl) && !imageFailed;

  return (
    <div className="flex h-full w-full items-center gap-10 overflow-hidden bg-black px-12 py-10">
      {showImage && (
        <div
          className="relative aspect-square w-[30%] shrink-0 overflow-hidden rounded-3xl"
          style={{ boxShadow: "0 20px 50px rgba(0,0,0,0.55)" }}
        >
          {/* imagem vem da API de notícias (domínio arbitrário, resolvido em runtime), incompatível com next/image. */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={article.imageUrl as string}
            alt=""
            onError={() => setImageFailed(true)}
            className="h-full w-full object-cover"
            style={{ animation: `broadcast-news-parallax ${NEWS_ARTICLE_ROTATION_MS}ms ease-in-out forwards` }}
          />
          <div
            className="pointer-events-none absolute inset-0 rounded-3xl"
            style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.14)" }}
          />
        </div>
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        {article.sourceName && (
          <span
            className="w-fit rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
            style={{ background: TV_ACCENT_COLOR_SOFT, color: TV_ACCENT_COLOR }}
          >
            {article.sourceName}
          </span>
        )}
        <p
          className="text-5xl leading-tight font-bold"
          style={{ color: "#FFFFFF", animation: "broadcast-news-title-in 600ms ease both" }}
        >
          {article.title}
        </p>
        {article.description && (
          <p
            className="line-clamp-5 text-xl"
            style={{ color: "rgba(255,255,255,0.85)", animation: "broadcast-news-title-in 600ms ease 120ms both" }}
          >
            {article.description}
          </p>
        )}
      </div>
    </div>
  );
}

// Compartilhado pela layer "news" standalone (rodízio contínuo, sem teto) e pelo slide "news"
// dentro da playlist (o teto de tempo do bloco inteiro é responsabilidade de quem monta/desmonta
// este componente — PlaylistLayer via useTimedAdvance — não deste rodízio interno de manchete).
function NewsCardRotator({ articles }: { articles: RegionNewsArticle[] }) {
  const [index, setIndex] = useState(0);
  const current = articles.length > 0 ? articles[index % articles.length] : null;

  useTimedAdvance(NEWS_ARTICLE_ROTATION_MS, () => setIndex((previous) => (previous + 1) % articles.length), articles.length > 1);

  if (!current) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-black" style={{ color: "rgba(255,255,255,0.4)" }}>
        Sem notícias no momento
      </div>
    );
  }

  return <NewsSlideCard key={current.link} article={current} />;
}

// Slide "em destaque" de UM evento único da agenda, no meio do rodízio de vídeos — pedido
// explícito: "não quero que entre a agenda [inteira], apenas um item da agenda, com todas as
// informações". 2º redesenho (pedido explícito: "mais ênfase no texto" + "a imagem... você está
// usando apenas o corte que usamos no quadrado pequeno, essa imagem é maior e wide, aproveita
// melhor"): a 1ª versão (capa full-bleed atrás de tudo + scrim) cropava a foto pro aspect-ratio da
// CAIXA do slide, que na prática é estreita/alta quando a gaveta de agenda está aberta (o vídeo
// encolhe em largura, ver applyAgendaViewSizeOverride) — uma capa larga acabava reduzida a uma
// fatia vertical estreita do meio, o mesmo problema visual do card pequeno antigo. A correção é dar
// à imagem uma CAIXA LARGA de verdade (banda horizontal no topo, ~58% da altura, largura cheia) em
// vez de deixá-la se espremer na caixa inteira do slide — um object-cover numa banda larga mostra
// muito mais da foto original (que é wide) do que o mesmo object-cover numa caixa alta e estreita.
// O texto ganha um painel PRÓPRIO sólido embaixo (não mais sobreposto à foto com scrim) — contraste
// garantido sem depender da exposição da capa, e libera peso tipográfico bem maior (title 7xl
// extrabold, meta em 3xl com o horário na cor de destaque) sem competir visualmente com a imagem.
// Zoom lento (Ken Burns) mantido, esticado pra duração REAL do slide (durationSeconds do item).
// Evento sem capa: o painel de texto ocupa a tela inteira, centralizado.
//
// event null (evento apagado depois do item criado, ver classifyPlaylistItem) nunca chega a
// renderizar de fato: PlaylistLayer detecta isEmptySlide e avança em 1s antes que isto apareça por
// tempo perceptível — o fundo preto abaixo é só a rede de segurança desse instante.
function FeaturedAgendaEventSlide({
  event,
  durationSeconds,
  timeZone,
}: {
  event: AgendaRotationEvent | null;
  durationSeconds: number;
  timeZone: string;
}) {
  // useClock (não Date.now() direto) — precisa ser reativo pro badge trocar sozinho pra
  // "Acontecendo" no instante em que o evento começa e voltar quando termina, sem esperar o
  // próximo refetch de estado. Hook sempre chamado antes do guard `if (!event)` (regra de hooks).
  const now = useClock();
  if (!event) return <div className="h-full w-full bg-black" />;

  // Datas do evento (primária + avulsas). Com avulsas, o badge grande mostra a PRÓXIMA data ainda
  // futura entre todas, e uma lista de linhas substitui o "dia • horário" único; "Hoje"/
  // "Acontecendo" olham QUALQUER data.
  const occurrences = eventOccurrences(event);
  const hasExtraDates = occurrences.length > 1;
  const displayOccurrence = hasExtraDates ? nextFutureOccurrence(event, now ?? new Date()) : occurrences[0];
  const { day, month, weekday, time } = formatEventDay(displayOccurrence.startAt, timeZone);
  const today = occurrences.some((occurrence) => isSameDay(occurrence.startAt, timeZone));
  // "Acontecendo agora" — pedido explícito: "quando o evento começar, coloque o status
  // 'acontecendo', e destaque as cores". Prevalece sobre "Hoje"/"Agenda" quando true (ver o badge
  // abaixo) — laranja (TV_HAPPENING_NOW_COLOR) em vez da cor de destaque padrão, pra ficar
  // visualmente distinto dos outros dois estados.
  const happeningNow =
    now !== null && occurrences.some((occurrence) => isEventHappeningNow(occurrence.startAt, occurrence.endAt, now));
  const weekdayAndTime = `${weekday} • ${time}${formatEndTimeSuffix(displayOccurrence.startAt, displayOccurrence.endAt, timeZone)}`;
  const hasCover = Boolean(event.coverUrl);

  // Badge "Acontecendo"/"Hoje"/"Agenda" — mesma regra visual do card da gaveta lateral
  // (AgendaLayer), agora em fluxo normal como a PRIMEIRA linha da coluna de texto (pedido
  // explícito, mesma sessão: "quero que a badge do acontecendo esteja sobre o título no Card") —
  // sempre a primeira coisa antes do título, nunca flutuando solto em outro canto.
  const statusBadge = (
    <span
      className="w-fit rounded-full px-6 py-2.5 text-2xl font-bold uppercase tracking-wide"
      style={
        happeningNow
          ? { background: TV_HAPPENING_NOW_COLOR, color: TV_HAPPENING_NOW_FOREGROUND }
          : { background: today ? TV_ACCENT_COLOR : TV_ACCENT_COLOR_SOFT, color: today ? TV_ACCENT_FOREGROUND : TV_ACCENT_COLOR }
      }
    >
      {happeningNow ? "Acontecendo" : today ? "Hoje" : "Agenda"}
    </span>
  );

  // Layout novo (pedido explícito: "cria um novo layout para a view do evento em destaque") —
  // troca de empilhado (imagem em cima, texto embaixo) para lado a lado: a foto vira um painel
  // full-height à esquerda, o texto ocupa a altura INTEIRA do slide à direita. Isso resolve por
  // construção o bug da versão anterior (badges vazando por cima da imagem quando o bloco de
  // texto não cabia na fatia vertical que sobrava): imagem e texto não competem mais pelo mesmo
  // eixo, um overflow vertical do texto nunca mais pode visualmente invadir a imagem, porque eles
  // não são mais vizinhos no eixo vertical. object-contain (não -cover) preserva o pedido anterior
  // de mostrar a foto inteira, sem cortar — a folga vira letterbox no fundo do próprio painel
  // (mesma cor do resto do slide). Tamanhos recalibrados pra essa geometria: a coluna de texto
  // agora tem 100% da altura do slide pra trabalhar (era ~62% no layout empilhado), então um
  // título grande cabe com folga sem precisar do valor extremo (18rem) que só existia pra
  // compensar a pouca altura que sobrava ali.
  return (
    <div className="flex h-full w-full overflow-hidden" style={{ background: DEFAULT_AGENDA_BACKGROUND }}>
      {hasCover && (
        <div className="relative h-full w-[42%] shrink-0 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element -- capa vem de contexts/media (Blob), domínio arbitrário. */}
          <img
            src={event.coverUrl as string}
            alt=""
            className="absolute inset-0 h-full w-full object-contain"
            style={{ animation: `broadcast-news-parallax ${Math.max(durationSeconds, 1) * 1000}ms ease-in-out forwards` }}
          />
          {/* Costura com a coluna de texto — degradê horizontal (era vertical no layout
              empilhado), mesma cor de fundo do painel. */}
          <div
            className="pointer-events-none absolute inset-y-0 right-0 w-24"
            style={{ background: `linear-gradient(90deg, rgba(15,15,15,0) 0%, ${DEFAULT_AGENDA_BACKGROUND} 100%)` }}
          />
        </div>
      )}

      <div
        className={`flex min-h-0 flex-1 flex-col justify-center gap-8 overflow-hidden px-16 py-14 ${hasCover ? "" : "items-center text-center"}`}
      >
        <div className={`flex items-center gap-4 ${hasCover ? "" : "justify-center"}`}>
          {statusBadge}
          <span
            className="w-fit rounded-full px-6 py-2.5 text-2xl font-bold uppercase tracking-wide"
            style={{ background: TV_ACCENT_COLOR_SOFT, color: TV_ACCENT_COLOR }}
          >
            {day} {month}
          </span>
        </div>
        {/* Pedido explícito: "diminua o tamanho do texto do título" (era text-[7rem]/112px) +
            "não corte as palavras, quebre a linha" — removido o line-clamp-2 que truncava com
            "..." depois de 2 linhas; agora quebra livremente em quantas linhas o título precisar,
            nunca corta palavra nenhuma. Seguro fazer isso aqui: a coluna de texto já tem
            overflow-hidden (proteção contra um título absurdamente longo), e o layout lado-a-lado
            (ver comentário acima da função) garante que um eventual corte por overflow nunca mais
            vaza visualmente sobre a imagem, só sobre o próprio espaço vazio da coluna. */}
        <p
          className="text-6xl leading-[1.15] font-extrabold tracking-tight"
          style={{ color: "#FFFFFF", animation: "broadcast-news-title-in 600ms ease both" }}
        >
          {event.title}
        </p>
        {event.description && (
          <p className="line-clamp-2 max-w-4xl text-4xl" style={{ color: "rgba(255,255,255,0.8)" }}>
            {event.description}
          </p>
        )}
        <div className={`flex flex-wrap items-center gap-x-10 gap-y-4 ${hasCover ? "" : "justify-center"}`}>
          {hasExtraDates ? (
            <div className={`flex flex-col gap-2 ${hasCover ? "" : "items-center"}`}>
              {occurrences.map((occurrence, occurrenceIndex) => (
                <span
                  key={occurrenceIndex}
                  className="flex items-center gap-4 text-3xl font-bold"
                  style={{ color: TV_ACCENT_COLOR }}
                >
                  <Clock className="size-10 shrink-0" aria-hidden />
                  {formatOccurrenceLine(occurrence, timeZone)}
                </span>
              ))}
            </div>
          ) : (
            <span className="flex items-center gap-4 text-3xl font-bold" style={{ color: TV_ACCENT_COLOR }}>
              <Clock className="size-10 shrink-0" aria-hidden />
              {weekdayAndTime}
            </span>
          )}
          {event.location && (
            <span className="flex items-center gap-4 text-3xl font-bold" style={{ color: "rgba(255,255,255,0.95)" }}>
              <MapPin className="size-10 shrink-0" aria-hidden />
              {event.location}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// Compartilhado por InfoLayer/AgendaLayer. Começa null (não em new Date()) de propósito: SSR e o
// primeiro render client hidratam com "sem hora ainda" idêntico, só o efeito (client-only) enche
// depois — evita mismatch de hidratação por fuso/instante de render diferentes.
function useClock(): Date | null {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const interval = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(interval);
  }, []);

  return now;
}

function InfoLayer({ weather, timeZone }: { weather: RegionWeather | null; timeZone: string }) {
  const now = useClock();

  if (!now) return null;

  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone });
  const date = now.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone });

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-center" style={{ color: "#FFFFFF" }}>
      <span className="text-5xl font-semibold">{time}</span>
      <span className="text-sm capitalize" style={{ color: "rgba(255,255,255,0.8)" }}>{date}</span>
      {weather && (
        <span className="mt-2 text-xl">
          {weather.emoji} {Math.round(weather.temperatureC)}°C — {weather.conditionLabel}
        </span>
      )}
    </div>
  );
}

function NewsLayer({ articles }: { articles: RegionNewsArticle[] }) {
  return <NewsCardRotator articles={articles} />;
}

// weekday entra pro card de evento — pedido explícito: "existem eventos que são recorrentes toda
// semana, vale colocar o dia da semana na view, não apenas a data numérica" (pra "toda quinta"
// ficar óbvio de bater o olho, sem precisar calcular o dia da semana a partir do número).
// timeZone (fuso da instituição, vindo de get-output-state) aplicado a TODA formatação — a TV
// pode estar num fuso diferente do da sede, mas o card mostra sempre a parede da sede.
function formatEventDay(startAt: string | Date, timeZone: string): { day: string; month: string; weekday: string; time: string } {
  const date = typeof startAt === "string" ? new Date(startAt) : startAt;
  return {
    day: date.toLocaleDateString("pt-BR", { day: "2-digit", timeZone }),
    month: date.toLocaleDateString("pt-BR", { month: "short", timeZone }).replace(".", ""),
    weekday: date.toLocaleDateString("pt-BR", { weekday: "short", timeZone }).replace(".", ""),
    time: date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone }),
  };
}

// "" quando não tem término definido. endAt agora é um timestamp completo (pode cair em qualquer
// data posterior ao início, inclusive dias depois — pedido explícito: "o término pode acontecer em
// qualquer data posterior... pode haver eventos que duram dias") — quando cai no MESMO dia do
// início, mostra só a hora ("–15:30"), igual sempre foi; quando cai em outro dia, mostra a data do
// término também ("–14/03 18:00"), senão um evento overnight ("22:00–02:00") parece um término
// antes do início por engano. Mesmo racional de formatEndTimeSuffix no admin (agenda-section.tsx).
// startAt/endAt chegam como string depois de um round-trip JSON (fetch/SSE não revivem Date
// automaticamente) — mesmo racional de formatEventDay aceitar "string | Date".
function formatEndTimeSuffix(startAt: string | Date, endAt: string | Date | null, timeZone: string): string {
  if (!endAt) return "";
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  const end = typeof endAt === "string" ? new Date(endAt) : endAt;
  const endTime = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone });
  // "mesmo dia" comparado NO fuso da instituição — um evento overnight ("22:00–02:00") não pode
  // parecer que termina antes de começar só porque a virada de dia cai num fuso diferente.
  if (isSameZonedCalendarDay(start, end, timeZone)) return `–${endTime}`;
  const endDay = end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone });
  return ` – ${endDay} ${endTime}`;
}

function isSameDay(startAt: string | Date, timeZone: string): boolean {
  const date = typeof startAt === "string" ? new Date(startAt) : startAt;
  return isSameZonedCalendarDay(date, new Date(), timeZone);
}

// Uma ocorrência do evento: a data primária + cada data avulsa (broadcast_agenda_event_dates).
// startAt/endAt chegam como string depois do round-trip JSON — as helpers de formatação já lidam.
type EventOccurrence = { startAt: string | Date; endAt: string | Date | null };

function occurrenceStartMs(occurrence: EventOccurrence): number {
  return new Date(occurrence.startAt).getTime();
}

function occurrenceEndMs(occurrence: EventOccurrence): number {
  return new Date(occurrence.endAt ?? occurrence.startAt).getTime();
}

// Todas as datas do evento (primária + extras), ordenadas por início. Sem extras devolve só a
// primária — o chamador decide entre a linha única de sempre e uma lista.
function eventOccurrences(event: AgendaRotationEvent): EventOccurrence[] {
  const all: EventOccurrence[] = [
    { startAt: event.startAt, endAt: event.endAt },
    ...(event.extraDates ?? []).map((date) => ({ startAt: date.startAt, endAt: date.endAt })),
  ];
  return all.sort((a, b) => occurrenceStartMs(a) - occurrenceStartMs(b));
}

// A próxima ocorrência ainda não terminada entre todas — o badge grande de data e o ticker mostram
// essa. Quando todas já passaram (o evento ainda pode estar visível "no dia" da última), cai na
// última.
function nextFutureOccurrence(event: AgendaRotationEvent, now: Date): EventOccurrence {
  const occurrences = eventOccurrences(event);
  return occurrences.find((occurrence) => occurrenceEndMs(occurrence) >= now.getTime()) ?? occurrences[occurrences.length - 1];
}

// "12 set • qua 14:00–15:30" — uma linha por data quando o evento tem datas avulsas.
function formatOccurrenceLine(occurrence: EventOccurrence, timeZone: string): string {
  const { day, month, weekday, time } = formatEventDay(occurrence.startAt, timeZone);
  return `${day} ${month} • ${weekday} ${time}${formatEndTimeSuffix(occurrence.startAt, occurrence.endAt, timeZone)}`;
}


// Paleta fixa da view de saída — centralizada em ./tv-tokens.ts (Ponto 9 #6). Continua fora do
// vocabulário shadcn de propósito (a rota standalone não tem contexto de tema); o racional
// completo está no cabeçalho daquele módulo.


// Painel "premium" pedido explicitamente: logo + nome da agenda em destaque, cards de evento com
// badge de data (+ capa opcional), evento de hoje realçado com a cor de destaque. Rotaciona entre
// agendas (agendaRotation já vem sem as vazias — ver get-output-state) — cada uma fica
// entry.agenda.displaySeconds na tela antes de trocar, com fundo e logo PRÓPRIOS por agenda
// (agenda.backgroundColor/logoUrl — cai no padrão da plataforma/preto quando a agenda não
// configurou os seus) e fade suave, e pontos indicando a posição no rodízio. Relógio/clima
// migraram pra barra inferior da camada "video" (MainZoneLayer) — não aparecem mais aqui.
function AgendaLayer({
  rotation,
  brandLogoUrl,
  animationStyle,
  drawerOpen,
  timeZone,
}: {
  rotation: AgendaRotationEntry[];
  brandLogoUrl: string | null;
  animationStyle: BroadcastAgendaAnimationStyle;
  // Só usado pra fazer a entrada dos eventos REPETIR a cada vez que o drawer abre (ver a key do
  // bloco de eventos logo abaixo) — a geometria/abertura em si (LayerRenderer) já lê drawerOpen
  // direto, não precisa dele pra mais nada aqui.
  drawerOpen: boolean;
  // Fuso da instituição — formatação de data/hora e "hoje" de cada card de evento.
  timeZone: string;
}) {
  const [index, setIndex] = useState(0);
  // Mesmo mecanismo de PlaylistLayer — reinicia a contagem automática a partir de um clique manual.
  const [manualTick, setManualTick] = useState(0);
  // Pro badge "Acontecendo" de cada evento (ver isEventHappeningNow logo abaixo, no .map) — hook
  // sempre chamado, antes do guard `if (!current) return null` (regra de hooks).
  const now = useClock();
  const current = rotation.length > 0 ? rotation[index % rotation.length] : null;
  const advanceAgenda = () => setIndex((previous) => (previous + 1) % rotation.length);

  // Rodízio 100% interno e contínuo — o scheduler de pausa em output-canvas.tsx (useAgendaRotationSchedule)
  // só decide QUANDO a coluna abre/fecha (janela fixa de segundos, ver o hook), nunca QUAL agenda
  // mostrar dentro da janela; isso continua sendo decisão exclusivamente desta layer, igual antes
  // de o ciclo de pausa existir.
  useTimedAdvance(current ? current.agenda.displaySeconds * 1000 : 0, advanceAgenda, rotation.length > 1, manualTick);

  // Esta layer fica sempre montada agora, mesmo com o drawer fechado (ver LayerRenderer/
  // applyAgendaViewSizeOverride — a gaveta anima abrindo/fechando via CSS, não via mount/unmount);
  // current só é null quando a rotação está genuinamente vazia (nenhuma agenda com evento futuro).
  // O rodízio continua avançando em segundo plano mesmo com a coluna fechada/pausada (mesmo
  // racional do vídeo, que também não pausa quando o drawer fecha) — reabrir mostra a agenda que
  // estiver "em cartaz" naquele momento, não necessariamente a mesma de antes de fechar.
  if (!current) return null;

  const backgroundColor = current.agenda.backgroundColor ?? DEFAULT_AGENDA_BACKGROUND;
  const palette = resolveContrastPalette(backgroundColor);
  const logoUrl = current.logoUrl ?? brandLogoUrl;

  // Clicável quando há mais de uma agenda no rodízio — pedido explícito: "se clicar na Agenda,
  // muda a agenda". onClick direto no container (diferente de PlaylistLayer): aqui não existe
  // sub-elemento tipo <iframe> que engoliria o clique, então não precisa de uma camada extra por
  // cima.
  const clickable = rotation.length > 1;
  return (
    <div
      role={clickable ? "button" : undefined}
      aria-label={clickable ? "Avançar para a próxima agenda" : undefined}
      onClick={
        clickable
          ? () => {
              advanceAgenda();
              setManualTick((tick) => tick + 1);
            }
          : undefined
      }
      className={`relative flex h-full w-full flex-col overflow-hidden ${clickable ? "cursor-pointer" : ""}`}
      style={{ background: backgroundColor, transition: "background 500ms ease" }}
    >
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden px-7 pt-7">
        {/* "fade": o bloco inteiro (nome + eventos) surge junto, como sempre foi. "cascade": o
            bloco em si não anima — cada card de evento abaixo anima por conta própria, em
            sequência (animation-delay crescente por índice), então NÃO dá pra por animação aqui
            também (dobraria a animação: o bloco inteiro deslizando E os itens em cascata dentro
            dele ao mesmo tempo). Pedido explícito: "opção no sistema de colocar o fade atual ou
            essa [cascata]".

            key inclui drawerOpen (não só current.agenda.id) — remonta este bloco toda vez que o
            drawer abre, fazendo a animação de entrada repetir a cada abertura (pedido explícito:
            "já é para existir animação de entrada dos eventos"), não só na primeira vez que essa
            agenda apareceu na rotação. animationDelay = AGENDA_ENTRY_ANIMATION_DELAY_MS (mesma
            duração de GEOMETRY_TRANSITION) — sem isso a entrada dos eventos começava junto com o
            slide do drawer; "both" faz o elemento já nascer no estado inicial da animação (opacity
            0) durante o delay, em vez de aparecer cheio e só sumir/reaparecer no instante em que a
            animação de fato começa. */}
        <div
          key={`${current.agenda.id}-${drawerOpen}`}
          className="flex h-full min-h-0 flex-col gap-4"
          style={
            animationStyle === "fade"
              ? { animation: `broadcast-agenda-fade 500ms ease ${AGENDA_ENTRY_ANIMATION_DELAY_MS}ms both` }
              : undefined
          }
        >
          {/* Redesenho "moderno e premium" (pedido explícito) — o text-4xl solto anterior ficou
              grande demais/pesado; troca por um kicker discreto ("AGENDA") em caixa alta com
              tracking largo na cor de destaque + barra de acento vertical, ancorando um título
              menor e mais elegante ao lado. Mesmo par tipográfico (rótulo pequeno em cima/ao lado,
              elemento grande em destaque) já usado no relógio/clima da BrandFooterBar, pra manter
              consistência visual entre as duas peças de marca do canvas. */}
          <div className="flex flex-col gap-1.5">
            <span
              className="text-[11px] font-bold uppercase"
              style={{ color: TV_ACCENT_COLOR, letterSpacing: "0.32em" }}
            >
              Agenda
            </span>
            <div className="flex items-center gap-3">
              <span aria-hidden className="h-7 w-1 shrink-0 rounded-full" style={{ background: TV_ACCENT_COLOR }} />
              <span
                className="truncate text-2xl leading-tight font-bold uppercase"
                style={{ color: palette.foreground, letterSpacing: "0.01em" }}
              >
                {current.agenda.name}
              </span>
            </div>
          </div>
          <div className="flex flex-1 flex-col gap-2.5 overflow-hidden">
            {current.events.map((event, eventIndex) => {
              // Datas do evento (primária + avulsas). Com avulsas, o dateBadge mostra a próxima
              // data futura entre todas e a linha "seg • 14:00" vira uma lista; "Hoje"/"Acontecendo"
              // olham QUALQUER data.
              const occurrences = eventOccurrences(event);
              const hasExtraDates = occurrences.length > 1;
              const displayOccurrence = hasExtraDates ? nextFutureOccurrence(event, now ?? new Date()) : occurrences[0];
              const { day, month, weekday, time: eventTime } = formatEventDay(displayOccurrence.startAt, timeZone);
              const today = occurrences.some((occurrence) => isSameDay(occurrence.startAt, timeZone));
              // "Acontecendo agora" — mesmo racional/helper de FeaturedAgendaEventSlide (pedido
              // explícito: "quando o evento começar, coloque o status 'acontecendo', e destaque
              // as cores"). Prevalece sobre "Hoje" no badge/pill abaixo quando true.
              const happeningNow =
                now !== null &&
                occurrences.some((occurrence) => isEventHappeningNow(occurrence.startAt, occurrence.endAt, now));
              // "seg • 14:00" — pedido explícito: eventos recorrentes toda semana ficam óbvios de
              // bater o olho ("toda seg") sem precisar calcular a partir do número do dia. Com
              // horário de término opcional, vira "seg • 14:00–15:30".
              const weekdayAndTime = `${weekday} • ${eventTime}${formatEndTimeSuffix(displayOccurrence.startAt, displayOccurrence.endAt, timeZone)}`;
              // 120ms entre cada card (mais espaçado que a primeira versão, pedido explícito: "mais
              // expressiva") — devagar o bastante pra cada entrada da direita ser individualmente
              // percebida, não só um blur de movimento. Delay base de AGENDA_ENTRY_ANIMATION_DELAY_MS
              // (mesmo racional do bloco "fade" acima) soma-se ao escalonamento por card — a
              // cascata só começa depois que o drawer termina de abrir.
              const cascadeStyle: React.CSSProperties | undefined =
                animationStyle === "cascade"
                  ? {
                      animation: "broadcast-agenda-cascade-item 600ms cubic-bezier(0.16, 1, 0.3, 1) both",
                      animationDelay: `${AGENDA_ENTRY_ANIMATION_DELAY_MS + eventIndex * 120}ms`,
                    }
                  : undefined;

              // Redesenho completo — pedido explícito: "as informações em ordem hierárquica: Data,
              // Título, Local e horário" (não necessariamente ordem de LUGAR no card, só de
              // hierarquia visual). Ajuste seguinte: "Data está ótimo, o restante ainda está
              // pequeno, principalmente o horário — a pessoa precisa conseguir ler de longe" — a
              // hierarquia título > local > horário passou a vir só do tamanho do título (maior) e
              // do peso da fonte, nunca de deixar local/horário pequenos ou de baixo contraste
              // (isso é ilegível numa TV vista de longe, incompatível com o pedido).
              // Card com capa: a imagem full-bleed atrás do texto (versão anterior) foi abandonada
              // de propósito — pedido explícito: "a imagem de fundo é muito legal, mas dificulta
              // MUITO a leitura". Agora a imagem fica isolada num terço esquerdo (nunca mais atrás
              // de texto), com um leve véu de cor por cima (harmoniza com a paleta do card, não
              // compete visualmente com o lado de texto); o resto do card (2/3) é fundo sólido —
              // mesma legibilidade do card sem capa, sempre.
              const dateBadge = (
                <div
                  className="flex shrink-0 flex-col items-center justify-center rounded-md px-3.5 py-2.5 text-center leading-none"
                  style={
                    happeningNow
                      ? { background: TV_HAPPENING_NOW_COLOR, color: TV_HAPPENING_NOW_FOREGROUND, minWidth: "5.5rem" }
                      : {
                          background: today ? TV_ACCENT_COLOR : palette.subtle,
                          color: today ? TV_ACCENT_FOREGROUND : palette.foreground,
                          minWidth: "5.5rem",
                        }
                  }
                >
                  <span className="text-4xl font-bold">{day}</span>
                  {/* Maior e mais pesado que antes (era text-sm font-semibold, opacity 0.85) —
                      pedido explícito: "aumente e dê mais peso para o mês embaixo do dia". */}
                  <span className="mt-0.5 text-lg font-bold uppercase">{month}</span>
                </div>
              );

              // Título agora fica ACIMA da data e das informações (pedido explícito: "joga o
              // título sobre a data e as informações") — deixou de dividir a largura do card com o
              // badge de data ao lado; ocupa a linha inteira, sozinho, no topo. Data+local+horário
              // formam a segunda linha, abaixo. Local/horário continuam com contraste total
              // (palette.foreground) e tamanho grande — pedido anterior: "a pessoa precisa
              // conseguir ler de longe". Sem truncate em lugar nenhum (pedido explícito: "ajuste as
              // informações para quebrar linha") — título/local longos agora quebram em várias
              // linhas em vez de cortar com "..."; por isso os itens usam items-start (não
              // items-center) quando têm ícone, senão o ícone ficaria "flutuando" no meio de um
              // texto de duas linhas. O card com capa trocou de altura FIXA pra min-height (ver
              // abaixo) pra crescer junto com o texto, em vez de cortar o excesso por baixo.
              const metaRow = (
                <div className="flex items-center gap-3">
                  {dateBadge}
                  <div className="min-w-0 flex-1">
                    {event.location && (
                      <span className="flex items-start gap-2 text-xl font-medium" style={{ color: palette.foreground }}>
                        <MapPin className="mt-1 size-5 shrink-0" aria-hidden />
                        <span>{event.location}</span>
                      </span>
                    )}
                    <span className="mt-1.5 flex items-start gap-2 text-xl font-semibold" style={{ color: palette.foreground }}>
                      <Clock className="mt-1 size-5 shrink-0" aria-hidden />
                      {hasExtraDates ? (
                        <span className="flex flex-col gap-0.5">
                          {occurrences.map((occurrence, occurrenceIndex) => (
                            <span key={occurrenceIndex}>{formatOccurrenceLine(occurrence, timeZone)}</span>
                          ))}
                        </span>
                      ) : (
                        <span>{weekdayAndTime}</span>
                      )}
                    </span>
                  </div>
                </div>
              );

              // Descrição, quando houver, entra entre o título e a data/local/horário — pedido
              // explícito: "a descrição quando houver deve aparecer no card" (já aparecia no card
              // "em destaque" de FeaturedAgendaEventSlide e no admin, faltava só aqui, o card da
              // gaveta lateral). line-clamp-2 (não sem-truncate como título/local acima) — vários
              // eventos empilham no mesmo painel, uma descrição longa sem limite empurraria os
              // cards seguintes pra fora da área visível.
              //
              // "Acontecendo"/"Hoje" — pedido explícito: "quero que a badge do acontecendo esteja
              // sobre o título no Card". Antes era um <span> `absolute right-2 top-2` ancorado no
              // canto do CARD inteiro (podia ficar longe do título dependendo da altura do card,
              // ver captura de tela); agora entra em fluxo normal, primeira linha do próprio
              // `cardBody`, sempre imediatamente acima do título — nunca mais desalinha dele.
              const statusPill = (today || happeningNow) && (
                <span
                  className="w-fit rounded-full px-2.5 py-1 text-xs font-bold uppercase"
                  style={
                    happeningNow
                      ? { background: TV_HAPPENING_NOW_COLOR, color: TV_HAPPENING_NOW_FOREGROUND }
                      : { background: TV_ACCENT_COLOR, color: TV_ACCENT_FOREGROUND }
                  }
                >
                  {happeningNow ? "Acontecendo" : "Hoje"}
                </span>
              );
              const cardBody = (
                <div className="flex min-w-0 flex-1 flex-col justify-center gap-3">
                  {event.coverUrl && statusPill}
                  <p className="text-3xl leading-tight font-bold" style={{ color: palette.foreground }}>{event.title}</p>
                  {event.description && (
                    <p className="line-clamp-2 text-lg font-medium" style={{ color: palette.muted }}>{event.description}</p>
                  )}
                  {metaRow}
                </div>
              );

              if (event.coverUrl) {
                return (
                  <div key={event.id} className="relative flex min-h-44 w-full shrink-0 overflow-hidden rounded-lg" style={cascadeStyle}>
                    <div className="relative w-1/3 shrink-0 overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element -- cover vem de contexts/media (Blob), domínio arbitrário. */}
                      <img src={event.coverUrl} alt="" className="absolute inset-0 h-full w-full object-cover" />
                      <div className="absolute inset-0" style={{ background: DEFAULT_AGENDA_BACKGROUND, opacity: 0.3 }} />
                    </div>
                    <div className="flex flex-1 items-center p-4" style={{ background: today ? palette.todayBg : palette.subtle }}>
                      {cardBody}
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={event.id}
                  className="flex items-center rounded-lg p-4"
                  style={{ background: today ? palette.todayBg : palette.subtle, ...cascadeStyle }}
                >
                  {cardBody}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Brand descido pro canto inferior direito (pedido explícito: "Desça o Brand da Agenda
          para a parte inferior direita") — item de flex normal (shrink-0), não posicionamento
          absoluto, então reserva a própria altura na coluna: a lista de eventos acima (flex-1
          min-h-0 overflow-hidden) nunca desenha por baixo dele (pedido explícito: "Não permita
          que tenha eventos até o Brand"). Menor que antes (h-16 em vez de h-20) — deixou de ser o
          elemento principal da coluna, esse papel agora é do título. */}
      {logoUrl && (
        <div className="flex shrink-0 justify-end px-7 pb-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo vem de contexts/media (Blob), domínio arbitrário. */}
          <img
            src={logoUrl}
            alt=""
            className="h-16 max-w-48 w-auto object-contain"
            style={palette.isLight ? undefined : { filter: "brightness(0) invert(1)" }}
          />
        </div>
      )}

      {rotation.length > 1 && (
        <div className="flex justify-center gap-1.5 pb-3">
          {rotation.map((entry, entryIndex) => (
            <span
              key={entry.agenda.id}
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: entryIndex === index % rotation.length ? TV_ACCENT_COLOR : palette.subtle }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// "Aviso rápido" — invisível quando não há mensagem ativa; quando há, uma faixa que EMPURRA o
// resto do layout (irmã de altura natural na coluna flex do canvas, depois da região de camadas e
// do footer — ver OutputCanvas), não mais um overlay `fixed`/z-index máximo. Achado direto do
// usuário: um overlay cobria conteúdo por baixo (ex: parte do vídeo, ou a agenda); em flow normal
// ela só reduz a altura disponível pra região de camadas acima, sem esconder nada.
export function AlertBanner({ message }: { message: string | null }) {
  if (!message) return null;

  return (
    <div
      className="flex w-full shrink-0 items-center gap-3 px-7 py-5"
      style={{
        background: TV_ALERT_GRADIENT,
        color: "#FFFFFF",
        animation: "broadcast-alert-slide-up 400ms ease",
      }}
    >
      <span className="text-2xl">⚠️</span>
      <span className="text-xl font-semibold">{message}</span>
    </div>
  );
}

// Timings pedidos explicitamente: "intervalo de 15s entre cada evento, e de 30s entre cada
// lista [agenda]". Dois timers independentes, mesmo mecanismo de useTimedAdvance de AgendaLayer:
// o de agenda (30s) reseta o índice de evento a cada troca — resetKey=agendaIndex faz o timer
// interno reiniciar do zero junto, em vez de continuar de onde estava.
const TICKER_EVENT_DWELL_MS = 15_000;
const TICKER_AGENDA_DWELL_MS = 30_000;

// DENTRO da mesma linha de BrandFooterBar que já tem logo+relógio (não mais uma segunda linha
// abaixo, com borda própria) — pedido explícito original: "o ticker deve ser rotativo dentro do
// footer, entre o brand e o relógio". Ocupa o espaço flexível ENTRE a logo e o bloco de
// relógio/clima (flex-1, ver os dois pontos de uso em BrandFooterBar); o texto fica centralizado
// dentro dessa área (era alinhado à direita, colado no relógio — pedido explícito posterior:
// "centraliza o ticker dentro do footer"). Usa a paleta já resolvida do footer (mesma cor de fundo
// da marca) em vez de cor fixa própria. Renderiza null quando não há nenhuma agenda com evento futuro — quem
// monta este componente (BrandFooterBar) já só faz isso condicionado a tickerEnabled, este null
// extra cobre "ligado mas sem dado ainda".
function AgendaTickerInline({
  rotation,
  palette,
  timeZone,
}: {
  rotation: AgendaRotationEntry[];
  palette: ReturnType<typeof resolveContrastPalette>;
  timeZone: string;
}) {
  const [agendaIndex, setAgendaIndex] = useState(0);
  const [eventIndex, setEventIndex] = useState(0);

  const currentAgenda = rotation.length > 0 ? rotation[agendaIndex % rotation.length] : null;
  const events = currentAgenda?.events ?? [];
  const currentEvent = events.length > 0 ? events[eventIndex % events.length] : null;

  const advanceAgenda = () => {
    setAgendaIndex((previous) => (previous + 1) % rotation.length);
    setEventIndex(0);
  };
  const advanceEvent = () => setEventIndex((previous) => (previous + 1) % events.length);

  useTimedAdvance(TICKER_AGENDA_DWELL_MS, advanceAgenda, rotation.length > 1);
  useTimedAdvance(TICKER_EVENT_DWELL_MS, advanceEvent, events.length > 1, agendaIndex);

  if (!currentAgenda || !currentEvent) return null;

  // Com datas avulsas, mostra a próxima data futura entre todas (não a primária crua).
  const { weekday, time } = formatEventDay(nextFutureOccurrence(currentEvent, new Date()).startAt, timeZone);
  const parts = [currentAgenda.agenda.name, currentEvent.title, `${weekday} • ${time}`, currentEvent.location].filter(
    (part): part is string => Boolean(part),
  );

  return (
    // text-center (era text-right) — pedido explícito: "centraliza o ticker dentro do footer".
    // Ocupa a mesma área flex-1 entre a logo e o relógio; o texto agora fica centralizado NESSA
    // área (não colado no relógio à direita como antes).
    <div className="min-w-0 flex-1 overflow-hidden text-center">
      {/* Fade+slide (broadcast-news-title-in, mesma animação já usada nos títulos de notícia/
          evento em destaque) em vez do fade plano anterior — pedido explícito: "ticker: adiciona
          animação". key={currentEvent.id} força remount a cada troca, o que já retrigger a
          animação sozinho. */}
      <span
        key={currentEvent.id}
        className="block truncate font-medium text-sm"
        style={{ color: palette.muted, animation: "broadcast-news-title-in 500ms ease both" }}
      >
        {parts.join("   •   ")}
      </span>
    </div>
  );
}

export function LayerRenderer({
  layer,
  drawerOpen,
  playlistItemsByPlaylistId,
  resolvedAssetUrlByLayerId,
  regionWeather,
  regionNews,
  agendaRotation,
  brandLogoUrl,
  brandColor,
  agendaAnimationStyle,
  agendaViewSize,
  footerOpen,
  tickerEnabled,
  timeZone,
}: {
  layer: BroadcastLayerRecord;
  drawerOpen: boolean;
  playlistItemsByPlaylistId: Record<string, PlaylistItemSummary[]>;
  resolvedAssetUrlByLayerId: Record<string, string>;
  regionWeather: RegionWeather | null;
  regionNews: RegionNewsArticle[];
  agendaRotation: AgendaRotationEntry[];
  brandLogoUrl: string | null;
  brandColor: string;
  agendaAnimationStyle: BroadcastAgendaAnimationStyle;
  agendaViewSize: BroadcastAgendaViewSize;
  // BrandFooterBar agora mora dentro da camada "video" (ver VideoZoneLayer) — precisa saber se
  // deve montar, mesmo mecanismo de output.drawerOpen pra agenda.
  footerOpen: boolean;
  // Ticker de agenda — mora dentro de BrandFooterBar (ver comentário lá), então chega até aqui
  // pelo mesmo caminho de footerOpen.
  tickerEnabled: boolean;
  // Fuso da instituição (get-output-state) — toda data/hora e todo "hoje"/"agora" da view é
  // formatado/calculado nele, nunca no fuso do browser da TV.
  timeZone: string;
}) {
  // Hook sempre chamado, antes de qualquer return condicional (regra de hooks) — a agenda mede o
  // tempo todo agora (não só quando aberta), pra já saber o tamanho certo assim que a gaveta abrir
  // (sem isso, o primeiro "abrir" pularia de 0% direto pro valor medido, sem transição suave); o
  // vídeo só precisa medir quando a gaveta está de fato aberta (é quando ele encolhe).
  const needsAgendaWidthMeasurement = layer.type === "agenda" || (drawerOpen && layer.type === "video");
  const agendaWidthPercent = useZeroBarAgendaWidthPercent(agendaViewSize, footerOpen, needsAgendaWidthMeasurement);

  if (!layer.visible) return null;

  // "alert" não é mais renderizada aqui — vira AlertBanner, um irmão de altura natural no nível do
  // canvas (OutputCanvas filtra layers.type !== "alert" antes de mapear pra LayerRenderer), pra
  // poder empurrar o layout em vez de sobrepor (ver comentário em AlertBanner acima).
  // drawerOpen agora é "a coluna de agenda está aberta" (renomeado de conceito só na UI/comentários
  // — o campo no banco continua se chamando drawerOpen, ver outputs-section.tsx). A camada "agenda"
  // NÃO desmonta mais quando fecha (pedido explícito: "inclua animação de entrada e saída para o
  // drawer") — continua montada em x:100/width:0 (ver applyAgendaViewSizeOverride), colapsada e
  // invisível (overflow-hidden abaixo + opacity 0), e a mesma transição CSS que já anima
  // left/top/width/height anima o slide + fade de entrada/saída sozinha.
  const geometry = applyAgendaViewSizeOverride(
    layer,
    resolveLayerGeometry(layer, readGeometry(layer.config), drawerOpen),
    drawerOpen,
    agendaWidthPercent,
  );
  const opacity = layer.type === "agenda" && !drawerOpen ? 0 : 1;

  return (
    <div
      className="absolute overflow-hidden"
      style={{
        left: `${geometry.x}%`,
        top: `${geometry.y}%`,
        width: `${geometry.width}%`,
        height: `${geometry.height}%`,
        zIndex: layer.zIndex,
        opacity,
        transition: GEOMETRY_TRANSITION,
      }}
    >
      {renderLayerContent(
        layer,
        playlistItemsByPlaylistId,
        resolvedAssetUrlByLayerId,
        regionWeather,
        regionNews,
        agendaRotation,
        brandLogoUrl,
        brandColor,
        agendaAnimationStyle,
        agendaViewSize,
        footerOpen,
        drawerOpen,
        tickerEnabled,
        timeZone,
      )}
    </div>
  );
}

function renderLayerContent(
  layer: BroadcastLayerRecord,
  playlistItemsByPlaylistId: Record<string, PlaylistItemSummary[]>,
  resolvedAssetUrlByLayerId: Record<string, string>,
  regionWeather: RegionWeather | null,
  regionNews: RegionNewsArticle[],
  agendaRotation: AgendaRotationEntry[],
  brandLogoUrl: string | null,
  brandColor: string,
  agendaAnimationStyle: BroadcastAgendaAnimationStyle,
  agendaViewSize: BroadcastAgendaViewSize,
  footerOpen: boolean,
  drawerOpen: boolean,
  tickerEnabled: boolean,
  timeZone: string,
) {
  switch (layer.type) {
    case "video": {
      const playlistId = readString(layer.config, "playlistId");
      const items = playlistId ? (playlistItemsByPlaylistId[playlistId] ?? []) : [];
      // key={playlistId} força remount (e index volta a 0) quando a playlist da layer muda —
      // mais simples e mais barato que um useEffect resetando estado (react-hooks/set-state-in-effect).
      // newsArticles sempre vai — só é usado de fato se a playlist tiver um item "news" no meio.
      return (
        <VideoZoneLayer
          key={playlistId ?? layer.id}
          items={items}
          newsArticles={regionNews}
          footerOpen={footerOpen}
          brandLogoUrl={brandLogoUrl}
          brandColor={brandColor}
          weather={regionWeather}
          agendaViewSize={agendaViewSize}
          drawerOpen={drawerOpen}
          tickerEnabled={tickerEnabled}
          agendaRotation={agendaRotation}
          timeZone={timeZone}
        />
      );
    }
    case "image": {
      const url = resolvedAssetUrlByLayerId[layer.id];
      if (!url) return null;
      // fonte é a URL do Blob resolvida em runtime (config.mediaAssetId), não um asset estático
      // do bundle — next/image exige domínio conhecido em build, incompatível com storage plugável.
      // eslint-disable-next-line @next/next/no-img-element
      return <img src={url} alt="" className="h-full w-full object-cover" />;
    }
    case "text": {
      const text = readString(layer.config, "text") ?? "";
      const color = readString(layer.config, "color") ?? "#FFFFFF";
      return (
        <div className="flex h-full w-full items-center justify-center p-2 text-center" style={{ color }}>
          {text}
        </div>
      );
    }
    case "info":
      return <InfoLayer weather={regionWeather} timeZone={timeZone} />;
    case "news":
      return <NewsLayer articles={regionNews} />;
    case "agenda":
      return (
        <AgendaLayer
          rotation={agendaRotation}
          brandLogoUrl={brandLogoUrl}
          animationStyle={agendaAnimationStyle}
          drawerOpen={drawerOpen}
          timeZone={timeZone}
        />
      );
    default:
      return null;
  }
}
