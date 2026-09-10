export type BroadcastSceneRecord = {
  id: string;
  key: string;
  name: string;
  order: number;
  createdAt: Date;
  updatedAt: Date;
};

// Lista simplificada a pedido do usuário ("simplifica tudo, não preciso de tantas opções"):
// "clock" virou "info" (relógio + clima, mesmo tipo, mais informação, zero campo extra); "lower-
// third"/"custom-html" foram removidos (redundantes com "text" + um preset de posição). "news" e
// "agenda" são novos, também sem nenhum campo manual — resolvidos a partir de broadcast.region e
// da agenda interna do plugin. Migration 0001 remapeia layers existentes (clock→info, lower-
// third/custom-html→text) — nenhuma linha antiga fica com um type inválido. "alert" (2ª rodada)
// reintroduz o conceito de "lower third", mas com semântica diferente: normalmente invisível, só
// aparece quando há um aviso ativo (broadcast_alerts), e quando aparece ignora a geometria
// configurada — sempre sobrepõe tudo (ver layer-renderer.tsx).
export const BROADCAST_LAYER_TYPES = ["video", "text", "image", "info", "news", "agenda", "alert"] as const;
export type BroadcastLayerType = (typeof BROADCAST_LAYER_TYPES)[number];

// x/y/width/height em percentual (0-100), não pixel — a TV alvo pode ter resolução diferente
// (1080p/4K), então a posição precisa ser relativa ao viewport da view de saída.
export type BroadcastLayerRecord = {
  id: string;
  sceneId: string;
  type: BroadcastLayerType;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  config: Record<string, unknown>;
  visible: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type BroadcastPlaylistRecord = {
  id: string;
  name: string;
  // Pasta (relativa à raiz configurada em broadcast.rootFolder) varrida pelo scan — null quando a
  // playlist só tem itens do tipo "media-asset"/"webpage".
  folderPath: string | null;
  // Id da tela dona desta playlist (modelo 1:1 — ver database/schema/index.ts). null = playlist
  // "compartilhada" criada à mão, sem tela dona.
  ownerOutputId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// "webpage" é o terceiro tipo de origem: o conteúdo é uma URL (item.url), não um arquivo — não
// tem relativePath nem mediaAssetId (CHECK no schema garante a forma certa por sourceType). "news"
// é um marcador de posição no rodízio (nenhum de relativePath/mediaAssetId/url preenchido) — os
// artigos em si vêm de runtime/region-news.ts, resolvidos uma vez por saída, não por item.
// "agenda-event" referencia UM evento específico da agenda interna do plugin (agendaEventId) —
// pedido explícito: "não quero que entre a agenda [inteira], apenas um item da agenda, com todas
// as informações" — mostrado em tela cheia, entre os vídeos, pelo tempo configurado (mesmo padrão
// de duração de "webpage"/"news"), diferente da layer "agenda" (coluna lateral persistente com
// rodízio de TODOS os eventos futuros).
export const BROADCAST_PLAYLIST_ITEM_SOURCE_TYPES = ["local", "media-asset", "webpage", "news", "agenda-event"] as const;
export type BroadcastPlaylistItemSourceType = (typeof BROADCAST_PLAYLIST_ITEM_SOURCE_TYPES)[number];

// Item de playlist com origem tripla: "local" aponta pra um arquivo sob broadcast.rootFolder
// (servido pela rota de streaming com Range request); "media-asset" referencia media.assets por
// id (nunca acessa o storage/contexts/media diretamente — resolve via @/contexts/media);
// "webpage" guarda uma URL exibida em iframe. Exatamente um de relativePath/mediaAssetId/url/
// agendaEventId é preenchido, de acordo com sourceType (CHECK no schema). "kind" (vídeo/imagem/
// site) não é uma coluna — é derivado em get-output-state a partir da extensão/contentType (local/
// media-asset) ou é sempre "webpage"/"agenda-event" quando o sourceType já é inequívoco. hidden
// esconde o item da reprodução sem apagar (útil pra "pausar" um vídeo/imagem sem perder o
// cadastro).
export type BroadcastPlaylistItemRecord = {
  id: string;
  playlistId: string;
  order: number;
  title: string | null;
  sourceType: BroadcastPlaylistItemSourceType;
  relativePath: string | null;
  mediaAssetId: string | null;
  url: string | null;
  // Só preenchido quando sourceType = "agenda-event" — FK pra broadcastAgendaEvents (mesmo
  // plugin, referência real permitida, diferente de mediaAssetId acima que é de outro context).
  agendaEventId: string | null;
  durationSeconds: number | null;
  hidden: boolean;
  // Só relevante pra item de vídeo e "webpage" — toca o áudio na view em vez de sair mudo. Ver
  // o comentário da coluna with_audio em database/schema/index.ts.
  withAudio: boolean;
  // Janela de validade opcional (ver database/schema/index.ts) — o item só entra na reprodução
  // entre os dois; null/null = sempre visível.
  visibleFrom: Date | null;
  visibleUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

// Agenda interna do plugin (não é um calendário genérico reaproveitável por outro context/plugin
// — pedido explícito do usuário, "nossa própria agenda interna"). Uma instalação pode ter várias
// agendas nomeadas (semanal, mensal, faculdade, colégio...) — a layer "agenda" alterna entre elas,
// cada uma ficando `displaySeconds` na tela.
export type BroadcastAgendaRecord = {
  id: string;
  name: string;
  displaySeconds: number;
  order: number;
  // Hex (#rrggbb) escolhido pelo operador — null usa o fundo padrão do painel (ver layer-renderer.tsx).
  backgroundColor: string | null;
  // Logo própria da agenda (id cru — resolução de URL só em get-output-state, via getMediaAsset).
  // null cai na logo padrão da plataforma (brandLogoUrl).
  logoMediaAssetId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

// Uma data avulsa de um evento (ver broadcast_agenda_event_dates no schema) — o evento continua
// UM card, mas pode acontecer em dias separados, cada um com seu próprio horário. endAt null = sem
// término definido pra essa data (mesma semântica de BroadcastAgendaEventRecord.endAt).
export type BroadcastAgendaEventDate = {
  id: string;
  startAt: Date;
  endAt: Date | null;
};

export type BroadcastAgendaEventRecord = {
  id: string;
  agendaId: string;
  title: string;
  description: string | null;
  startAt: Date;
  // "Toda semana" — quando true, startAt é a ÂNCORA do padrão (dia da semana + horário), não a
  // data real do próximo evento (ver shared/weekly-recurrence.ts).
  recurring: boolean;
  // Timestamp completo (não só hora) — pode ser em qualquer data posterior ao início, inclusive
  // dias depois. null quando o evento não tem término definido. Pra evento recorrente, é só a
  // ÂNCORA do término — a duração (endAt - startAt) é o que se repete, ver
  // shared/weekly-recurrence.ts (resolveEventEndDate).
  endAt: Date | null;
  // Imagem de capa opcional (id cru) — sem ela, o card do evento renderiza igual a antes.
  coverMediaAssetId: string | null;
  // Local/sala do evento — texto livre, opcional, só exibição.
  location: string | null;
  // Datas EXTRAS (além da primária startAt/endAt) — sempre anexadas pelos finders de evento, nunca
  // uma coluna. [] pra evento sem datas extras e pra evento recorrente (não se aplica). Um evento
  // não-recorrente só sai do rodízio da agenda quando a ÚLTIMA data (primária ou extra) já passou.
  extraDates: BroadcastAgendaEventDate[];
  createdAt: Date;
  updatedAt: Date;
};

// Um slot de dayparting de uma tela (ver broadcastOutputPlaylistSchedule em
// database/schema/index.ts). days: bitmask, bit 0 = domingo ... bit 6 = sábado. start/end em
// minutos desde a meia-noite (0–1439), fim exclusivo, sem cruzar meia-noite.
export type BroadcastPlaylistScheduleSlot = {
  id: string;
  outputId: string;
  playlistId: string;
  days: number;
  startMinute: number;
  endMinute: number;
};

// Comunicado de urgência em tela cheia — cobre todas as telas (ver schema). No máximo um ativo,
// expira sozinho.
export type BroadcastTakeoverRecord = {
  id: string;
  message: string;
  mediaAssetId: string | null;
  expiresAt: Date;
  createdAt: Date;
};

// Aviso rápido (lower third / alerta) — no máximo um ativo por vez, expira sozinho (ver schema).
export type BroadcastAlertRecord = {
  id: string;
  message: string;
  expiresAt: Date;
  createdAt: Date;
};

// Evento com a URL de capa já resolvida (coverMediaAssetId -> coverUrl, via getMediaAsset) —
// mesmo racional de PlaylistItemSummary: client component de view de saída não resolve mídia
// sozinho, só recebe a URL pronta. extraDates passa cru (one-off, sem recorrência a resolver);
// depois do round-trip JSON os Date viram string, e as helpers da view já aceitam string|Date.
export type AgendaRotationEvent = BroadcastAgendaEventRecord & { coverUrl: string | null };

// Um "canal" de agenda com seus próximos eventos e logo já resolvidos — deliberadamente aqui em
// contracts/, não em features/outputs/get-output-state/types.ts, mesmo racional de
// PlaylistItemSummary abaixo (client component de view de saída não pode tocar o barrel inteiro).
export type AgendaRotationEntry = { agenda: BroadcastAgendaRecord; events: AgendaRotationEvent[]; logoUrl: string | null };

// Uma "saída" = uma URL de exibição (a que abre na TV). token é o único mecanismo de acesso —
// a view de saída não passa por sessão/RBAC (regra do plano: TV não faz login interativo).
export type BroadcastOutputRecord = {
  id: string;
  name: string;
  token: string;
  currentSceneId: string | null;
  currentPlaylistItemId: string | null;
  drawerOpen: boolean;
  // Mesmo mecanismo de drawerOpen (agenda), mas pra BrandFooterBar (logo+relógio+data+temperatura)
  // — alternável por saída, pedido explícito: "além de fechar a agenda, deve ser possível fechar o
  // footer".
  footerOpen: boolean;
  // Tela de espera branded ligada de propósito pelo admin (Fase 11) — quando true, a view mostra a
  // StandbyScreen no lugar do conteúdo. Independente de drawerOpen/footerOpen. Ver
  // components/output/standby-screen.tsx.
  offline: boolean;
  // Ticker de agenda no rodapé — opt-in, desligado por padrão. Independente de drawerOpen.
  tickerEnabled: boolean;
  // Ciclo fixo de abrir/pausar a coluna lateral (os dois juntos, ver database/schema/index.ts) —
  // qualquer um null/0 desliga o ciclo inteiro, rodízio contínuo sem pausa. Ver o scheduler client
  // em output-canvas.tsx.
  agendaOpenSeconds: number | null;
  agendaPauseSeconds: number | null;
  // PIN opcional de acesso à view pública desta saída — guardado como hash `scrypt$...` (ver
  // shared/pin-hash.ts), null = sem proteção. Nunca deve ser serializado pro browser (não faz
  // parte de BroadcastOutputState, ver get-output-state).
  pin: string | null;
  // Fallback de conteúdo (ver database/schema/index.ts) — usado quando a playlist não resolve nada
  // tocável. null/null = tela de espera padrão.
  fallbackMediaAssetId: string | null;
  fallbackMessage: string | null;
  // Horário de funcionamento (ver database/schema/index.ts) — fora dele a tela entra em modo
  // espera. null = sem horário (sempre no ar).
  activeDays: number | null;
  activeStartMinute: number | null;
  activeEndMinute: number | null;
  // Rótulo de grupo pra ações em lote no admin — null = sem grupo.
  groupName: string | null;
  // "Congelar" — a playlist para de avançar (item atual fixo) sem ir pra tela de espera.
  frozen: boolean;
  createdAt: Date;
  updatedAt: Date;
};

// Forma resolvida de um item de playlist exposta pra renderização client-side (view de saída) —
// deliberadamente aqui em contracts/, não em features/outputs/get-output-state/types.ts, pra que
// um client component possa importar o tipo sem tocar o barrel inteiro do plugin (que arrasta
// handlers server-only pro bundle do browser — bug real encontrado no `next build`).
// "kind" já vem classificado (não é o sourceType cru) — o client só decide <video>/<img>/<iframe>/
// bloco de notícias/card de evento. "news"/"agenda-event" são 1:1 com o sourceType homônimo (nada
// a derivar, diferente de vídeo/imagem).
export type PlaylistItemKind = "video" | "image" | "webpage" | "news" | "agenda-event";
export type PlaylistItemSummary = {
  id: string;
  order: number;
  kind: PlaylistItemKind;
  // Rótulo pra humano (título do operador → nome do arquivo → URL → tipo). Usado no beacon de
  // telemetria ("tocando 3/8 — X") e no proof-of-play. Nunca vazio.
  label: string;
  // Só relevante pra "image"/"webpage"/"news"/"agenda-event" — vídeo usa a duração natural do
  // arquivo (onEnded). Pra "news" é o teto do bloco inteiro (todas as manchetes rodando), não por
  // manchete; pra "agenda-event" é quanto tempo o card do evento fica sozinho na tela.
  durationSeconds: number | null;
  // Só preenchido pra "webpage".
  url: string | null;
  // Só relevante pra "video"/"webpage" — a view toca o áudio em vez de sair mudo (ver
  // with_audio no schema e o render em layer-renderer.tsx).
  withAudio: boolean;
  // Só preenchido pra "agenda-event" — já resolvido (startAt = próxima ocorrência real mesmo se
  // recorrente, coverUrl já é URL, não id) pelo mesmo racional de AgendaRotationEvent. null quando
  // o evento referenciado não existe mais (ex: apagado depois do item criado) — o client degrada
  // pulando rápido pro próximo item, mesmo racional de bloco de notícias vazio.
  event: AgendaRotationEvent | null;
};

// Clima resolvido pra região configurada (broadcast.region) — null quando a região não está
// configurada ou a resolução falhou (layer "info" degrada mostrando só o relógio).
export type RegionWeather = {
  temperatureC: number;
  weatherCode: number;
  conditionLabel: string;
  emoji: string;
};

// Notícia resolvida pra região configurada — imageUrl/description podem ser null (nem toda notícia
// tem foto ou resumo).
export type RegionNewsArticle = {
  title: string;
  description: string | null;
  link: string;
  imageUrl: string | null;
  sourceName: string | null;
};

// Evento empurrado do painel de controle pra view de saída via SSE (runtime/output-bus.ts).
// Deliberadamente não carrega item de playlist — sequenciar qual vídeo toca dentro de uma
// playlist é decisão client-side da view de saída (onEnded → próximo item), não algo que o
// servidor sincroniza por evento; só "qual cena" e "drawer aberto/fechado" são estado de
// controle real.
// "alert-changed" (aviso rápido entrou/foi limpo) e "playlist-changed" (troca de playlist da
// camada de vídeo de uma saída) não carregam payload de propósito — o cliente da view de saída já
// refaz o fetch do estado completo em qualquer evento que não seja `type: "state"` (ver
// output-canvas.tsx), então basta sinalizar "algo mudou, rebusque". "alert-changed" é global (o
// alerta não é por saída) — publicado pra todos os tokens; "playlist-changed" é publicado só pro
// token da saída afetada.
// "reload" — o admin manda a TV recarregar a página (útil quando uma TV bugou e ninguém quer ir
// lá fisicamente). O cliente da view faz window.location.reload() ao receber; sem payload. É o
// único evento que NÃO é "algo mudou, rebusque o estado" — é uma ordem de recarregar.
export type BroadcastOutputEvent =
  | { type: "scene-changed"; sceneId: string | null }
  | { type: "drawer-changed"; drawerOpen: boolean }
  | { type: "footer-changed"; footerOpen: boolean }
  | { type: "ticker-changed"; tickerEnabled: boolean }
  | { type: "agenda-schedule-changed"; agendaOpenSeconds: number | null; agendaPauseSeconds: number | null }
  | { type: "offline-changed"; offline: boolean }
  | { type: "frozen-changed"; frozen: boolean }
  | { type: "alert-changed" }
  | { type: "takeover-changed" }
  | { type: "playlist-changed" }
  // "algo na config desta saída mudou, rebusque o estado" — genérico (fallback, horário de
  // funcionamento). O cliente já refaz o fetch em qualquer evento != "state".
  | { type: "settings-changed" }
  | { type: "reload" };

// Snapshot que a própria view de saída reporta sobre si mesma (ver components/output/output-
// canvas.tsx) — lido direto do DOM (document.querySelector("video") +
// getVideoPlaybackQuality()), independente do watchdog interno de VideoSlide em layer-renderer.tsx
// (sonda separada de propósito — ver comentário no plano/AGENTS deste feature: threading um
// callback por 4 camadas de layer-renderer.tsx arriscava as invariantes de "nunca remontar o
// <video>" documentadas lá). Todo campo é opcional/best-effort: uma TV sem <video> tocando agora
// (playlist de só imagem, por exemplo) manda um snapshot sem os campos de vídeo.
export type BroadcastBrowserDiagnosticsSnapshot = {
  hasVideo: boolean;
  droppedRatio: number | null;
  videoPaused: boolean | null;
  videoReadyState: number | null;
  disconnected: boolean;
  documentHidden: boolean;
  userAgent: string;
  screenWidth: number;
  screenHeight: number;
  usedJsHeapSizeBytes: number | null;
};

// Snapshot que o script scripts/broadcast-diag-agent.ps1 reporta sobre o PC da TV. GPU é best-
// effort (nome/driver via WMI, não % de carga — Windows não expõe isso de forma confiável pra
// iGPU em todo hardware). serverReachable/serverLatencyMs vêm de um Test-NetConnection do próprio
// agent contra o servidor, útil pra distinguir "o PC está mal" de "a rede até o servidor está
// ruim" quando o agent para de reportar.
export type BroadcastAgentDiagnosticsSnapshot = {
  cpuLoadPercent: number | null;
  ramUsedPercent: number | null;
  ramTotalMb: number | null;
  gpuName: string | null;
  uptimeSeconds: number | null;
  localIp: string | null;
  serverReachable: boolean | null;
  serverLatencyMs: number | null;
};

// Diagnóstico consolidado de UMA saída pra tela /admin/broadcast/diagnostics — browserStale/
// agentStale calculados em cima de *ReportedAt contra os limiares de report (20s browser, 30s
// agent — ver get-output-diagnostics/service.ts), não guardados no banco.
export type BroadcastOutputDiagnosticsRecord = {
  outputId: string;
  browserSnapshot: BroadcastBrowserDiagnosticsSnapshot | null;
  browserReportedAt: Date | null;
  browserStale: boolean;
  agentSnapshot: BroadcastAgentDiagnosticsSnapshot | null;
  agentReportedAt: Date | null;
  agentStationLabel: string | null;
  agentStale: boolean;
};

// Snapshot do processo Next.js inteiro — sempre lido ao vivo (runtime/diagnostics-bus.ts), nunca
// persistido; não é por saída.
export type BroadcastServerDiagnosticsSnapshot = {
  uptimeSeconds: number;
  rssBytes: number;
  eventLoopLagP50Ms: number;
  eventLoopLagP99Ms: number;
  gcCountByKind: Record<string, number>;
  streamsActive: number;
  streamsTotal: number;
  streamsAbortedTotal: number;
  avgTtfbMs: number | null;
};

export const BROADCAST_DIAG_EVENT_SOURCES = ["browser", "agent", "server"] as const;
export type BroadcastDiagEventSource = (typeof BROADCAST_DIAG_EVENT_SOURCES)[number];

export const BROADCAST_DIAG_EVENT_LEVELS = ["info", "warning"] as const;
export type BroadcastDiagEventLevel = (typeof BROADCAST_DIAG_EVENT_LEVELS)[number];

export type BroadcastDiagEventRecord = {
  id: string;
  outputId: string | null;
  source: BroadcastDiagEventSource;
  level: BroadcastDiagEventLevel;
  message: string;
  detail: Record<string, unknown>;
  createdAt: Date;
};
