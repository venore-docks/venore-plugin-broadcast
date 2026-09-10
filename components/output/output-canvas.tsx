"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
// Tipo importado direto da feature, não do barrel (@/plugins/broadcast) — mesmo racional de
// layer-renderer.tsx: este é um "use client" component, e o barrel arrasta handlers server-only
// pro bundle do browser.
import type { BroadcastOutputState } from "../../features/outputs/get-output-state/types";
import {
  resolveOutputStageTransform,
  type OutputStageTransform,
} from "../../shared/output-stage";
import { AlertBanner, LayerRenderer, useTimedAdvance } from "./layer-renderer";
import { FreezeContext, NowPlayingContext, type NowPlayingInfo } from "./now-playing-context";
import { StandbyScreen } from "./standby-screen";

// Duração da troca de cena é comportamento do plugin, não decisão de design de marca (mesmo
// racional do GEOMETRY_TRANSITION em layer-renderer.tsx) — fica como constante local.
const SCENE_FADE_MS = 400;

// Rede de segurança independente do SSE: se por qualquer motivo de ambiente (proxy reverso
// bufferizando o stream, etc.) um evento não chegar, a TV nunca fica desatualizada por mais que
// esse intervalo — não depende de ninguém apertar F5.
const FALLBACK_POLL_MS = 15_000;

// Detecção de desconexão 100% client-side (não muda o servidor): a cada DISCONNECT_CHECK_MS
// comparamos "agora" com o último sync bem-sucedido (evento SSE `type:"state"` ou refetch HTTP
// OK). Passou de DISCONNECTED_AFTER_MS sem nenhum sync → overlay StandbyScreen `disconnected`
// sobre o último quadro; ao voltar a sincronizar some sozinho. 45s ≈ 3 ciclos do poll de
// fallback (o heartbeat SSE são comentários `:`, que não disparam onmessage — por isso a régua é
// o poll, não o heartbeat).
const DISCONNECT_CHECK_MS = 5_000;
const DISCONNECTED_AFTER_MS = 45_000;

// Watchdog de último recurso: se a TV ficar SEM NENHUM sync com o servidor por esse tempo contínuo
// (SSE morto + todo refetch falhando), um location.reload() dá um estado limpo — resolve o caso
// clássico de TV ligada há dias com um EventSource travado que nem reconecta, ou um bundle que
// falhou a carregar parcialmente. Bem acima de DISCONNECTED_AFTER_MS (que só mostra o overlay):
// primeiro tenta se recuperar sozinha por vários minutos, só recarrega se realmente não voltar.
const HARD_RELOAD_AFTER_MS = 4 * 60_000;

// Animação CSS pura (@keyframes broadcast-scene-fade, ver <style> abaixo), não mais um
// useState+useEffect setando opacity depois do mount. Achado real: numa TV com engine JS
// desatualizada/bundle que falha ao carregar, o opacity:0 inicial (que o SSR já manda pronto no
// HTML) nunca virava opacity:1 — tela ficava permanentemente em branco, mesmo com o HTML/CSS
// tendo chegado certinho. Uma animação CSS roda sozinha ao pintar o DOM, sem depender de nenhum
// JS — e se o navegador nem suportar @keyframes (caso extremo), o elemento cai no estado padrão
// (sem opacity declarado fora da animação = visível), nunca no inverso.
function SceneFade({ children }: { children: ReactNode }) {
  return (
    <div className="absolute inset-0" style={{ animation: `broadcast-scene-fade ${SCENE_FADE_MS}ms ease both` }}>
      {children}
    </div>
  );
}

// Scheduler client do ciclo abrir/pausar a coluna de agenda (output.agendaOpenSeconds/
// agendaPauseSeconds) — pedido explícito: "quero escolher quando essa pausa acontece [...] deixar
// a agenda aberta por uns 3 min, depois 1 min de pausa". Janela FIXA, sem relação nenhuma com o
// número de agendas ou o displaySeconds de cada uma (isso é responsabilidade da própria
// AgendaLayer, que continua rodando seu rodízio interno livremente por dentro da janela aberta —
// correção de uma 1ª versão que pausava depois de CADA agenda individual, sem controle sobre
// quando). Sem os dois campos configurados (qualquer um null/0), devolve o comportamento
// original — drawer só segue o toggle manual, rodízio contínuo sem pausa nenhuma.
//
// Reaproveita useTimedAdvance (mesmo hook que PlaylistLayer/AgendaLayer já usam pra alternar
// slide/agenda) em vez de reimplementar o timer — durationMs muda a cada troca de fase (mostrando
// → openSeconds; pausado → pauseSeconds), o que já é o padrão estabelecido pelas outras layers pra
// reagendar automaticamente (ver comentário na definição do hook).
function useAgendaRotationSchedule(
  hasContent: boolean,
  openSeconds: number | null,
  pauseSeconds: number | null,
  manualOpen: boolean,
): boolean {
  const [phase, setPhase] = useState<"showing" | "paused">("showing");
  const scheduled = manualOpen && hasContent && Boolean(openSeconds) && Boolean(pauseSeconds);

  const durationMs = (phase === "showing" ? (openSeconds ?? 0) : (pauseSeconds ?? 0)) * 1000;

  useTimedAdvance(durationMs, () => setPhase((previous) => (previous === "showing" ? "paused" : "showing")), scheduled);

  if (!scheduled) return manualOpen && hasContent;
  return phase === "showing";
}

// Escala do palco de composição pro viewport real — ver shared/output-stage.ts pro racional
// (por que `transform: scale` e não rem/em). Mede `window.innerWidth/innerHeight` (o viewport
// onde a view É pintada), não `window.screen` (isso é do cálculo de largura da agenda em
// layer-renderer.tsx, que tem outra exigência — estabilidade a F11).
//
// SSR-safe: começa no palco 1920x1080 sem escala (mesmo que resolveOutputStageTransform devolve
// pra tela ainda-não-medida), então o primeiro paint já mostra a view composta, nunca em branco
// — a primeira medição real roda num setTimeout(0), não síncrona no corpo do efeito (mesma
// convenção de useZeroBarAgendaWidthPercent / react-hooks/set-state-in-effect).
function useOutputStageTransform(): OutputStageTransform {
  const [transform, setTransform] = useState<OutputStageTransform>(() => resolveOutputStageTransform(0, 0));

  useEffect(() => {
    let cancelled = false;
    const measure = () => {
      if (cancelled) return;
      setTransform(resolveOutputStageTransform(window.innerWidth, window.innerHeight));
    };
    const timeoutId = setTimeout(measure, 0);
    window.addEventListener("resize", measure);
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      window.removeEventListener("resize", measure);
    };
  }, []);

  return transform;
}

export function OutputCanvas({ token, initialState }: { token: string; initialState: BroadcastOutputState }) {
  const [state, setState] = useState(initialState);
  // Último instante (epoch ms) em que o estado foi confirmado pelo servidor (SSE `type:"state"` ou
  // refetch HTTP OK). Ref, não state — só o timer de checagem abaixo lê, nunca dispara render por
  // si. Começa em 0 e é semeado com `Date.now()` dentro do efeito de montagem (nunca no corpo do
  // render — `Date.now()` é impuro): o SSR já entregou um estado válido, então montar já conta
  // como "sincronizado agora".
  const lastSyncAtRef = useRef(0);
  const [disconnected, setDisconnected] = useState(false);

  useEffect(() => {
    lastSyncAtRef.current = Date.now();

    const markSynced = () => {
      lastSyncAtRef.current = Date.now();
      setDisconnected(false);
    };

    const refetchState = async () => {
      try {
        const response = await fetch(`/api/broadcast/output/${token}/state`, { cache: "no-store" });
        if (response.ok) {
          setState(await response.json());
          markSynced();
        }
      } catch {
        // Uma falha pontual de refetch só deixa o quadro atual na tela até o próximo evento —
        // EventSource já reconecta sozinho por spec, não precisa de retry manual aqui. O overlay
        // de desconexão (useEffect abaixo) cobre a falha PROLONGADA.
      }
    };

    // EventSource não é garantido em engines de TV mais antigas — se a API não existir ou a
    // criação falhar, a atualização cai inteiramente no polling abaixo. Isso precisa vir DEPOIS
    // do polling estar registrado (ou num try/catch que não interrompe o resto do efeito): um
    // `new EventSource(...)` que lança como primeira linha do efeito pulava tudo que vinha
    // depois, inclusive o setInterval de segurança — a própria rede de segurança nunca chegava a
    // existir.
    let eventSource: EventSource | null = null;
    if (typeof EventSource !== "undefined") {
      try {
        eventSource = new EventSource(`/api/broadcast/output/${token}/events`);
        eventSource.onmessage = (event) => {
          const message = JSON.parse(event.data) as { type: string; state?: BroadcastOutputState };
          if (message.type === "state" && message.state) {
            setState(message.state);
            markSynced();
            return;
          }
          // Ordem explícita do admin pra esta TV recarregar (não é "algo mudou, rebusque"). Ver
          // BroadcastOutputEvent em contracts/types.ts e features/outputs/reload-output.
          if (message.type === "reload") {
            window.location.reload();
            return;
          }
          void refetchState();
        };
      } catch {
        eventSource = null;
      }
    }

    const pollInterval = setInterval(() => void refetchState(), FALLBACK_POLL_MS);

    return () => {
      eventSource?.close();
      clearInterval(pollInterval);
    };
  }, [token]);

  // Timer separado que só olha o relógio — não faz rede nenhuma, então não precisa remontar
  // quando `token` muda nem conviver com o efeito de assinatura acima. setState idempotente
  // (mesmo valor não re-renderiza), seguro pra rodar a cada DISCONNECT_CHECK_MS.
  // Telemetria de volta pro servidor (viewport/navegador/status) — o admin usa pra saber que TV
  // está de fato no ar e há quanto tempo (ver runtime/output-beacon.ts). clientId estável por
  // sessão de aba; crypto.randomUUID só existe em contexto seguro (a view roda em HTTP na LAN),
  // por isso o fallback.
  const clientIdRef = useRef<string>("");
  if (!clientIdRef.current) {
    clientIdRef.current =
      globalThis.crypto?.randomUUID?.() ?? `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
  const beaconStatusRef = useRef("playing");
  beaconStatusRef.current = state.offline ? "standby" : disconnected ? "disconnected" : "playing";

  // "Qual item toca agora" — reportado pelo PlaylistLayer via NowPlayingContext. Dedupe pra não
  // re-renderizar toda vez que o layer reemite o mesmo valor.
  const [nowPlaying, setNowPlayingState] = useState<NowPlayingInfo | null>(null);
  const reportNowPlaying = useCallback((info: NowPlayingInfo | null) => {
    setNowPlayingState((prev) => (prev?.itemId === info?.itemId && prev?.index === info?.index ? prev : info));
  }, []);
  const nowPlayingRef = useRef<{ text: string | null; itemId: string | null; label: string | null }>({
    text: null,
    itemId: null,
    label: null,
  });
  nowPlayingRef.current = nowPlaying
    ? { text: `${nowPlaying.index}/${nowPlaying.count} — ${nowPlaying.label}`, itemId: nowPlaying.itemId, label: nowPlaying.label }
    : { text: null, itemId: null, label: null };

  useEffect(() => {
    const send = () => {
      try {
        void fetch(`/api/broadcast/output/${token}/beacon`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            clientId: clientIdRef.current,
            viewport: `${window.innerWidth}x${window.innerHeight}`,
            userAgent: navigator.userAgent,
            status: beaconStatusRef.current,
            nowPlaying: nowPlayingRef.current.text,
            nowPlayingItemId: nowPlayingRef.current.itemId,
            nowPlayingLabel: nowPlayingRef.current.label,
          }),
          keepalive: true,
        });
      } catch {
        // best-effort — a telemetria nunca deve atrapalhar a reprodução.
      }
    };
    send();
    const interval = setInterval(send, 30_000);
    return () => clearInterval(interval);
  }, [token]);

  const hardReloadTriggeredRef = useRef(false);
  useEffect(() => {
    const interval = setInterval(() => {
      const staleFor = Date.now() - lastSyncAtRef.current;
      setDisconnected(staleFor > DISCONNECTED_AFTER_MS);
      // Watchdog: passou de HARD_RELOAD_AFTER_MS sem nenhum sync → recarrega a página uma vez (o
      // ref evita disparar de novo se o reload demorar a acontecer). lastSyncAtRef é semeado com
      // Date.now() na montagem, então logo depois de um reload o contador zera.
      if (staleFor > HARD_RELOAD_AFTER_MS && !hardReloadTriggeredRef.current) {
        hardReloadTriggeredRef.current = true;
        window.location.reload();
      }
    }, DISCONNECT_CHECK_MS);
    return () => clearInterval(interval);
  }, []);

  // "alert" nunca vem do mapa de layers normal — vira um irmão de altura natural no fim da coluna
  // flex (ver AlertBanner), pra empurrar o layout em vez de sobrepor (pedido explícito: "quando a
  // barra de aviso aparece, ela não deve sobrepor nada, ela deve empurrar").
  const contentLayers = state.layers.filter((layer) => layer.type !== "alert");
  // A coluna de agenda só fica de fato aberta quando drawerOpen=true E existe alguma agenda com
  // evento futuro pra mostrar — pedido explícito: "se não houver agenda ativa, feche a agenda no
  // View". agendaRotation já vem [] tanto quando drawerOpen=false (get-output-state nem resolve)
  // quanto quando está aberta mas nenhuma agenda tem evento futuro — os dois casos devem fechar a
  // coluna e devolver a largura pro vídeo, não só o primeiro. Reabre sozinho assim que alguma
  // agenda ganhar um evento futuro de novo, sem precisar de ação manual. Com um ciclo configurado
  // (state.agendaOpenSeconds + state.agendaPauseSeconds), o scheduler acima passa a alternar entre
  // "mostrando"/"pausado" também — qual agenda aparece dentro da janela aberta continua sendo
  // decisão da própria AgendaLayer (rodízio interno dela, não muda aqui).
  const effectiveDrawerOpen = useAgendaRotationSchedule(
    state.agendaRotation.length > 0,
    state.agendaOpenSeconds,
    state.agendaPauseSeconds,
    state.drawerOpen,
  );

  const stage = useOutputStageTransform();

  // Aviso rápido: esconde a faixa no INSTANTE do vencimento (state.activeAlertExpiresAt), sem
  // esperar o próximo poll de 15s — era o que fazia um aviso de "10s" ficar ~15-25s na tela. O
  // relógio só é lido DENTRO do efeito (nunca no render — react-hooks/purity, mesmo racional de
  // lastSyncAtRef acima); o efeito reseta a flag e reagenda sempre que chega um aviso novo (a
  // dep muda). O poll seguinte sincroniza activeAlertMessage=null no servidor de todo jeito.
  // O servidor só manda activeAlertExpiresAt quando há um aviso de fato ativo (o store filtra
  // expiresAt > now), então toda vez que essa dep muda o aviso está no ar agora → reseta a flag
  // (setTimeout 0, nunca setState síncrono no corpo do efeito) e agenda a expiração pro instante
  // exato. Date.now() só aqui dentro, nunca no render.
  const [alertExpired, setAlertExpired] = useState(false);
  useEffect(() => {
    if (!state.activeAlertExpiresAt) return;
    const msLeft = Date.parse(state.activeAlertExpiresAt) - Date.now();
    const reset = setTimeout(() => setAlertExpired(false), 0);
    const expire = setTimeout(() => setAlertExpired(true), Math.max(0, msLeft));
    return () => {
      clearTimeout(reset);
      clearTimeout(expire);
    };
  }, [state.activeAlertExpiresAt]);

  const visibleAlertMessage = state.activeAlertMessage && !alertExpired ? state.activeAlertMessage : null;

  // Takeover — mesma mecânica de expiração local do aviso rápido (esconde no instante exato de
  // takeoverExpiresAt em vez de esperar o poll). Cobre TUDO (inclusive modo espera).
  const [takeoverExpired, setTakeoverExpired] = useState(false);
  useEffect(() => {
    if (!state.takeoverExpiresAt) return;
    const msLeft = Date.parse(state.takeoverExpiresAt) - Date.now();
    const reset = setTimeout(() => setTakeoverExpired(false), 0);
    const expire = setTimeout(() => setTakeoverExpired(true), Math.max(0, msLeft));
    return () => {
      clearTimeout(reset);
      clearTimeout(expire);
    };
  }, [state.takeoverExpiresAt]);
  const takeoverActive = !takeoverExpired && Boolean(state.takeoverMessage || state.takeoverMediaUrl);

  return (
    <NowPlayingContext.Provider value={reportNowPlaying}>
    <FreezeContext.Provider value={state.frozen}>
    {/* Fundo do canvas — pedido explícito: "altere o background da view [...] para #404040" (era
        preto puro, bg-black), depois "pode clarear mais, deixa cinza" (#737373), depois "altere de
        cinza para HSL 0 0 20%" (= #333333, hue/saturação 0 = cinza puro, só a luminosidade muda).
        Hex direto via style, não className, mesmo racional do resto deste canvas (fora do
        vocabulário de cor do tema shadcn de propósito). */}
    <div className="fixed inset-0 overflow-hidden" style={{ background: "#333333" }}>
      {/* Keyframes usados por AgendaLayer/AlertBanner/NewsSlideCard (layer-renderer.tsx) —
          definidos uma vez aqui no root do canvas em vez de um <style> por instância de layer.
          Fica FORA do palco escalado de propósito: @keyframes é global, a posição no DOM não
          importa, e não faz sentido escalá-lo. */}
      <style>
        {"@keyframes broadcast-scene-fade { from { opacity: 0; } to { opacity: 1; } }" +
          "@keyframes broadcast-agenda-fade { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }" +
          // Item de evento entrando deslizado da DIREITA — usado com animation-delay crescente por
          // item (ver AgendaLayer) pra virar uma cascata em sequência, não os cards inteiros
          // aparecendo juntos. Estilo alternativo ao fade acima (BROADCAST_SETTINGS.agendaAnimationStyle).
          // Distância grande (64px) + easing com leve overshoot ("ease-emphasis", mesma curva
          // usada nos temas shadcn do projeto) — pedido explícito: "mais expressiva", não um
          // deslize discreto.
          "@keyframes broadcast-agenda-cascade-item { from { opacity: 0; transform: translateX(64px); } to { opacity: 1; transform: translateX(0); } }" +
          "@keyframes broadcast-alert-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }" +
          "@keyframes broadcast-news-title-in { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: translateY(0); } }" +
          // A StandbyScreen (Fase 11) carrega os próprios @keyframes num <style> local — ver
          // components/output/standby-screen.tsx — pra continuar íntegra renderizada fora deste canvas.
          "@keyframes broadcast-news-parallax { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.1) translate(-2%, -2%); } }" +
          // Deriva lenta do fundo borrado do letterbox (VideoSlide, layer-renderer.tsx) — mantém
          // movimento entre as amostras do frame e enquanto o vídeo está pausado. scale sempre > 1
          // pra o blur não revelar borda transparente.
          "@keyframes broadcast-blur-drift { from { transform: scale(1.08) translate(-1.5%, -1%); } to { transform: scale(1.14) translate(1.5%, 1%); } }"}
      </style>
      {/* Palco de composição: largura de referência FIXA (OUTPUT_STAGE_WIDTH_PX) + altura na
          proporção do viewport, escalado uniformemente pro tamanho real da tela via
          `transform: scale` — ver shared/output-stage.ts. Toda a régua interna (%, px, classes
          Tailwind de layer-renderer.tsx) é relativa a este palco, então 720p / 1080p / 4K
          renderizam o MESMO layout, só escalado. `flex flex-col` (antes no root fixed) vive aqui
          agora: a região de camadas e o AlertBanner se empilham DENTRO do palco. `origin-top-left`
          + palco cobrindo exatamente o viewport = o #333 do fundo só apareceria em arredondamento
          sub-pixel. */}
      <div
        className="absolute top-0 left-0 flex flex-col overflow-hidden"
        style={{
          width: `${stage.stageWidthPx}px`,
          height: `${stage.stageHeightPx}px`,
          transform: `scale(${stage.scale})`,
          transformOrigin: "top left",
        }}
      >
        {/* Tela offline ligada pelo admin (state.offline, via SSE "offline-changed") — a
            StandbyScreen toma o lugar do conteúdo INTEIRO do palco (camadas + AlertBanner), não
            um overlay: enquanto está offline não há conteúdo nenhum atrás pra mostrar. Volta ao
            desligar, sem reload (o próprio evento SSE já traz state.offline=false). */}
        {state.offline ? (
          <StandbyScreen reason="admin" brandLogoUrl={state.brandLogoUrl} />
        ) : (
          <>
            {/* Região que hospeda as camadas posicionadas por percentual (video/agenda/etc) —
                altura FLEXÍVEL (min-h-0 flex-1), encolhe sozinha quando o alerta abaixo ocupa
                espaço, sem precisar de nenhum cálculo manual de "altura restante": os
                `left/top/width/height: %` de cada LayerRenderer já são relativos a esta caixa, não
                à tela inteira. O footer não mora mais aqui em cima (canvas inteiro) — foi pra
                dentro da própria camada "video" (ver VideoZoneLayer em layer-renderer.tsx), pra só
                ocupar a largura do vídeo, nunca a da agenda — pedido explícito: "o Footer fica
                APENAS na parte da view do Vídeo, a Agenda vai do canto superior até o inferior". */}
            <div className="relative min-h-0 flex-1 overflow-hidden">
              <SceneFade key={state.scene?.id ?? "empty"}>
                {contentLayers.map((layer) => (
                  <LayerRenderer
                    key={layer.id}
                    layer={layer}
                    drawerOpen={effectiveDrawerOpen}
                    playlistItemsByPlaylistId={state.playlistItemsByPlaylistId}
                    resolvedAssetUrlByLayerId={state.resolvedAssetUrlByLayerId}
                    regionWeather={state.regionWeather}
                    regionNews={state.regionNews}
                    agendaRotation={state.agendaRotation}
                    brandLogoUrl={state.brandLogoUrl}
                    brandColor={state.brandColor}
                    agendaAnimationStyle={state.agendaAnimationStyle}
                    agendaViewSize={state.agendaViewSize}
                    footerOpen={state.footerOpen}
                    tickerEnabled={state.tickerEnabled}
                    timeZone={state.timeZone}
                  />
                ))}
              </SceneFade>
            </div>
            <AlertBanner message={visibleAlertMessage} />
          </>
        )}
        {/* Fallback de conteúdo da saída — quando a playlist não tem nada tocável E a saída tem
            fallback configurado, mostra ISSO no lugar da tela de espera genérica do PlaylistLayer.
            Overlay (por cima do StandbyScreen "no-content" que o PlaylistLayer já renderiza). Sai
            sozinho quando a playlist volta a ter conteúdo. Não aparece com offline/desconexão
            (esses têm a própria tela). */}
        {!state.offline && !disconnected && !state.hasPlayableContent && (state.fallbackUrl || state.fallbackMessage) && (
          <FallbackScreen url={state.fallbackUrl} message={state.fallbackMessage} />
        )}
        {/* Overlay de desconexão — SOBRE o último quadro (não substitui como o offline), sai
            sozinho quando a sincronização volta. Não faz sentido empilhar com a tela offline (que
            já é uma StandbyScreen própria e não depende de sync pra estar correta). */}
        {disconnected && !state.offline && (
          <StandbyScreen reason="disconnected" brandLogoUrl={state.brandLogoUrl} />
        )}
      </div>
      {/* Takeover de urgência — FORA do palco escalado, cobre o viewport inteiro por cima de tudo
          (conteúdo, modo espera, desconexão). Highest z. */}
      {takeoverActive && (
        <TakeoverScreen message={state.takeoverMessage} mediaUrl={state.takeoverMediaUrl} />
      )}
    </div>
    </FreezeContext.Provider>
    </NowPlayingContext.Provider>
  );
}

// Comunicado de urgência em tela cheia. Cores fixas (mesma exceção do resto do canvas). Fundo
// bem escuro + mensagem grande; imagem opcional atrás (object-contain, não corta).
function TakeoverScreen({ message, mediaUrl }: { message: string | null; mediaUrl: string | null }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden" style={{ background: "#0a0a0a" }}>
      {mediaUrl && /\.(mp4|webm)(\?|$)/i.test(mediaUrl) ? (
        <video src={mediaUrl} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-contain" />
      ) : mediaUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- imagem do takeover servida direto, sem next/image
        <img src={mediaUrl} alt="" className="absolute inset-0 h-full w-full object-contain" />
      ) : null}
      {message && (
        <p
          className="relative max-w-[85%] text-center text-5xl font-bold leading-tight"
          style={{ color: "#FFFFFF", textShadow: "0 4px 24px rgba(0,0,0,0.8)" }}
        >
          {message}
        </p>
      )}
    </div>
  );
}

// Tela de fallback da saída (imagem/vídeo da biblioteca + mensagem livre). Cores fixas — mesma
// exceção documentada do resto deste canvas (fora do tema shadcn do admin de propósito).
function FallbackScreen({ url, message }: { url: string | null; message: string | null }) {
  const isVideo = url ? /\.(mp4|webm)(\?|$)/i.test(url) : false;
  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden" style={{ background: "#0f0f0f" }}>
      {url && isVideo && (
        <video src={url} autoPlay muted loop playsInline className="absolute inset-0 h-full w-full object-cover" />
      )}
      {url && !isVideo && (
        // eslint-disable-next-line @next/next/no-img-element -- imagem de fallback servida direto, sem next/image
        <img src={url} alt="" className="absolute inset-0 h-full w-full object-cover" />
      )}
      {message && (
        <p
          className="relative max-w-[80%] text-center text-4xl font-semibold"
          style={{ color: "#FFFFFF", textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
        >
          {message}
        </p>
      )}
    </div>
  );
}
