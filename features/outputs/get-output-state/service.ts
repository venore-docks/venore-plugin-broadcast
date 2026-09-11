import path from "node:path";
import { getMediaAsset } from "@venore/plugin-sdk/media";
import { getSetting } from "@venore/plugin-sdk/settings";
import { getBrandConfig } from "@venore/plugin-sdk/brand";
import { resolveRegionNews } from "../../../runtime/region-news";
import { resolveRegionWeather } from "../../../runtime/region-weather";
import {
  DEFAULT_AGENDA_EVENT_SLIDE_DURATION_SECONDS,
  DEFAULT_NEWS_BLOCK_DURATION_SECONDS,
  DEFAULT_SLIDE_DURATION_SECONDS,
  DEFAULT_WEBPAGE_SLIDE_DURATION_SECONDS,
} from "../../../shared/playback-defaults";
import {
  BROADCAST_SETTINGS,
  type BroadcastAgendaAnimationStyle,
  type BroadcastAgendaViewSize,
} from "../../../shared/settings";
import { ensureSyncCursor, resetSyncCursor } from "../../../runtime/sync-cursor";
import { isWithinActiveHours, resolveScheduledPlaylistId } from "../../../shared/playlist-schedule";
import { normalizeTimeZone } from "../../../shared/timezone";
import { streamableContentTypeForExtension } from "../../../shared/video-extensions";
import { resolveEventEndDate, resolveEventOccurrenceDate } from "../../../shared/weekly-recurrence";
import type { BroadcastAgendaEventRecord, BroadcastPlaylistItemRecord, PlaylistItemKind } from "../../../contracts/types";
import {
  findActiveAlert,
  findAgendaEventById,
  findAllAgendas,
  findAllOutputAgendaLinks,
  findAllUpcomingAgendaEvents,
  findActiveTakeover,
  findLayersBySceneId,
  findOutputByToken,
  findPlaylistScheduleForOutput,
  findSceneById,
  findVisiblePlaylistItemsByPlaylistId,
} from "./store";
import type {
  AgendaRotationEntry,
  AgendaRotationEvent,
  BroadcastOutputState,
  GetOutputStateQuery,
  GetOutputStateResult,
  PlaylistItemSummary,
} from "./types";

const AGENDA_EVENTS_PER_ROTATION_LIMIT = 4;

function readStringConfig(config: Record<string, unknown>, key: string): string | null {
  const value = config[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

// "kind" nunca é uma coluna própria — sempre derivado aqui, na hora de resolver, a partir da
// extensão (local) ou do contentType (media-asset); "webpage"/"news" são inequívocos pelo
// sourceType. Mesma defesa em profundidade dos outros resolvers do plugin: nunca confia em dado
// gravado antes sem reconferir a fonte real.
async function classifyPlaylistItem(item: BroadcastPlaylistItemRecord, timeZone: string): Promise<PlaylistItemSummary> {
  // Rótulo pra humano (beacon "tocando 3/8 — X", proof-of-play) — título do operador, senão o nome
  // do arquivo, senão a URL.
  const rawLabel =
    item.title?.trim() ||
    (item.relativePath ? item.relativePath.split("/").pop() || item.relativePath : null) ||
    item.url ||
    null;

  if (item.sourceType === "webpage") {
    return {
      id: item.id,
      order: item.order,
      kind: "webpage",
      label: rawLabel ?? "Página web",
      durationSeconds: item.durationSeconds ?? DEFAULT_WEBPAGE_SLIDE_DURATION_SECONDS,
      url: item.url,
      withAudio: item.withAudio,
      event: null,
    };
  }

  if (item.sourceType === "news") {
    return {
      id: item.id,
      order: item.order,
      kind: "news",
      label: rawLabel ?? "Notícias",
      durationSeconds: item.durationSeconds ?? DEFAULT_NEWS_BLOCK_DURATION_SECONDS,
      url: null,
      withAudio: false,
      event: null,
    };
  }

  if (item.sourceType === "agenda-event") {
    const event = item.agendaEventId ? await findAgendaEventById(item.agendaEventId) : null;
    return {
      id: item.id,
      order: item.order,
      kind: "agenda-event",
      label: rawLabel ?? event?.title ?? "Evento da agenda",
      durationSeconds: item.durationSeconds ?? DEFAULT_AGENDA_EVENT_SLIDE_DURATION_SECONDS,
      url: null,
      withAudio: false,
      event: event ? await resolveAgendaRotationEvent(event, timeZone) : null,
    };
  }

  let contentType: string | null = null;
  if (item.sourceType === "local" && item.relativePath) {
    contentType = streamableContentTypeForExtension(path.extname(item.relativePath));
  } else if (item.sourceType === "media-asset" && item.mediaAssetId) {
    const asset = await getMediaAsset({ id: item.mediaAssetId });
    contentType = asset.success && asset.data ? asset.data.contentType : null;
  }

  const kind: PlaylistItemKind = contentType?.startsWith("image/") ? "image" : "video";
  return {
    id: item.id,
    order: item.order,
    kind,
    label: rawLabel ?? (kind === "image" ? "Imagem" : "Vídeo"),
    durationSeconds: kind === "image" ? (item.durationSeconds ?? DEFAULT_SLIDE_DURATION_SECONDS) : null,
    url: null,
    withAudio: kind === "video" ? item.withAudio : false,
    event: null,
  };
}

async function resolveMediaAssetUrl(mediaAssetId: string | null): Promise<string | null> {
  if (!mediaAssetId) return null;
  const asset = await getMediaAsset({ id: mediaAssetId });
  return asset.success && asset.data ? asset.data.url : null;
}

// Resolução por-evento compartilhada entre resolveAgendaRotation (rodízio da coluna lateral, um
// bucket por agenda) e classifyPlaylistItem (um único evento "em destaque" no meio da playlist) —
// mesmas transformações nos dois casos: startAt/endAt viram a ocorrência EFETIVA (nunca a âncora
// crua de um evento recorrente — endAt preserva a DURAÇÃO original mesmo cruzando pra outra
// semana, ver resolveEventEndDate) e coverMediaAssetId vira coverUrl (client nunca resolve mídia
// sozinho).
async function resolveAgendaRotationEvent(event: BroadcastAgendaEventRecord, timeZone: string): Promise<AgendaRotationEvent> {
  return {
    ...event,
    startAt: resolveEventOccurrenceDate(event, new Date(), timeZone),
    endAt: resolveEventEndDate(event, new Date(), timeZone),
    // Datas avulsas passam cru — são one-off (sem recorrência a resolver); o client formata cada
    // uma direto (as helpers da view já aceitam string|Date depois do round-trip JSON).
    extraDates: event.extraDates ?? [],
    coverUrl: await resolveMediaAssetUrl(event.coverMediaAssetId),
  };
}

// Agrupa os próximos eventos por agenda (uma query só pras duas tabelas, sem N+1) e descarta
// agenda sem nenhum evento futuro — não desperdiça tempo de tela mostrando uma agenda vazia no
// rodízio da layer "agenda". Cada agenda tem sua própria logo (logoMediaAssetId) e cada evento sua
// própria capa (coverMediaAssetId) — ambos opcionais, resolvidos aqui pra URL (client não toca
// mídia diretamente); ausência de um ou outro é responsabilidade do renderer degradar bem
// (logoUrl null usa a logo padrão da plataforma, coverUrl null mantém o card sem imagem).
// outputId decide quais agendas entram no rodízio DESTA saída — modelo "opt-in" (ver comentário
// no schema, broadcastOutputAgendas): uma agenda só aparece numa saída quando existe um vínculo
// explícito ligando as duas; sem vínculo nenhum, não aparece em lugar nenhum. Pedido real: "só
// deve aparecer QUANDO estiver vinculada a uma tela".
async function resolveAgendaRotation(outputId: string, timeZone: string): Promise<AgendaRotationEntry[]> {
  const [agendas, events, outputAgendaLinks] = await Promise.all([
    findAllAgendas(),
    findAllUpcomingAgendaEvents(),
    findAllOutputAgendaLinks(),
  ]);

  const agendaIdsAllowedForThisOutput = new Set(
    outputAgendaLinks.filter((link) => link.outputId === outputId).map((link) => link.agendaId),
  );

  // Ordena pela ocorrência EFETIVA (resolveEventOccurrenceDate), não pelo startAt cru — um evento
  // recorrente antigo (startAt de meses atrás, mas recurring=true) precisa entrar na posição
  // certa da fila, baseada na próxima vez que ele realmente acontece, não em quando foi criado.
  const sortedEvents = [...events].sort(
    (a, b) =>
      resolveEventOccurrenceDate(a, new Date(), timeZone).getTime() -
      resolveEventOccurrenceDate(b, new Date(), timeZone).getTime(),
  );

  const eventsByAgendaId = new Map<string, BroadcastAgendaEventRecord[]>();
  for (const event of sortedEvents) {
    const bucket = eventsByAgendaId.get(event.agendaId) ?? [];
    if (bucket.length < AGENDA_EVENTS_PER_ROTATION_LIMIT) bucket.push(event);
    eventsByAgendaId.set(event.agendaId, bucket);
  }

  const relevantAgendas = agendas.filter(
    (agenda) => (eventsByAgendaId.get(agenda.id)?.length ?? 0) > 0 && agendaIdsAllowedForThisOutput.has(agenda.id),
  );

  return Promise.all(
    relevantAgendas.map(async (agenda) => {
      const rawEvents = eventsByAgendaId.get(agenda.id) ?? [];
      const [logoUrl, resolvedEvents] = await Promise.all([
        resolveMediaAssetUrl(agenda.logoMediaAssetId),
        Promise.all(rawEvents.map((event) => resolveAgendaRotationEvent(event, timeZone))),
      ]);
      return { agenda, events: resolvedEvents, logoUrl };
    }),
  );
}

async function resolveBrandColor(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.brandColor.key });
  const value = result.success ? result.data?.value : null;
  return typeof value === "string" && value ? value : BROADCAST_SETTINGS.brandColor.defaultValue;
}

async function resolveAgendaAnimationStyle(): Promise<BroadcastAgendaAnimationStyle> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.agendaAnimationStyle.key });
  const value = result.success ? result.data?.value : null;
  return value === "cascade" ? "cascade" : "fade";
}

async function resolveAgendaViewSize(): Promise<BroadcastAgendaViewSize> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.agendaViewSize.key });
  const value = result.success ? result.data?.value : null;
  if (value === "padrao" || value === "extra-grande") return value;
  return "grande";
}

// Fuso da instituição — sempre resolvido (não é lazy como os demais): o client precisa dele pra
// formatar QUALQUER data/hora (relógio do rodapé, cards de agenda, "hoje"/"agora"), e é uma
// leitura de setting de uma linha. Cai no default quando ausente/inválido.
async function resolveTimeZone(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.timezone.key });
  return normalizeTimeZone(result.success ? result.data?.value : null);
}

// Resolve o estado completo pra primeira renderização da view de saída: a página server component
// chama isto direto (sem round-trip HTTP), e a mesma forma de estado é o que a rota SSE
// (app/api/broadcast/output/[token]/events) manda como primeiro evento de hydration, e o que
// app/api/broadcast/output/[token]/state devolve quando o client refaz a consulta após um evento.
export async function getOutputState(query: GetOutputStateQuery): Promise<GetOutputStateResult> {
  const output = await findOutputByToken(query.token);
  if (!output) {
    return { success: false, error: { code: "broadcast.get-output-state.not_found", message: "Saída não encontrada." } };
  }

  // Resolvido antes de tudo: classifyPlaylistItem (evento "em destaque") e resolveAgendaRotation
  // precisam do fuso pra resolver a ocorrência efetiva de eventos recorrentes na parede da sede.
  const timeZone = await resolveTimeZone();

  const scene = output.currentSceneId ? await findSceneById(output.currentSceneId) : null;
  const sceneLayers = scene ? await findLayersBySceneId(scene.id) : [];

  // Dayparting: se um slot de programação casa com "agora" (parede da instituição), a camada de
  // vídeo passa a apontar pra playlist do slot NO LUGAR da config.playlistId gravada — o cliente da
  // view (layer-renderer) nem sabe da troca, só renderiza o que recebe. Sem slot casando, os
  // layers vão crus, comportamento anterior. Ver shared/playlist-schedule.ts.
  const scheduledPlaylistId = resolveScheduledPlaylistId(
    await findPlaylistScheduleForOutput(output.id),
    new Date(),
    timeZone,
  );
  const layers =
    scheduledPlaylistId != null
      ? sceneLayers.map((layer) =>
          layer.type === "video" && readStringConfig(layer.config, "playlistId")
            ? { ...layer, config: { ...layer.config, playlistId: scheduledPlaylistId } }
            : layer,
        )
      : sceneLayers;

  const videoPlaylistIds = new Set<string>();
  for (const layer of layers) {
    if (layer.type !== "video") continue;
    const playlistId = readStringConfig(layer.config, "playlistId");
    if (playlistId) videoPlaylistIds.add(playlistId);
  }

  const playlistItemsByPlaylistId: Record<string, PlaylistItemSummary[]> = {};
  for (const playlistId of videoPlaylistIds) {
    const items = await findVisiblePlaylistItemsByPlaylistId(playlistId);
    playlistItemsByPlaylistId[playlistId] = await Promise.all(items.map((item) => classifyPlaylistItem(item, timeZone)));
  }
  // "news" agora é um item de playlist manipulável (posição/duração próprias), não mais um
  // checkbox na config da layer — precisa resolver os artigos sempre que algum item classificar
  // como "news" em qualquer playlist referenciada.
  const anyPlaylistHasNewsItem = Object.values(playlistItemsByPlaylistId).some((items) =>
    items.some((item) => item.kind === "news"),
  );
  // "O canal é essencialmente vídeo" — mesmo critério de PlaylistLayer.hasPlayableVideo: sem
  // nenhum item de vídeo tocável, a view cai numa tela de espera (ou no fallback da saída).
  const hasPlayableContent = Object.values(playlistItemsByPlaylistId).some((items) =>
    items.some((item) => item.kind === "video"),
  );

  // Reprodução sincronizada (v1.8, v1.8.4 — sempre ligada, independente de grupo): toda tela que
  // toca uma playlist de vídeo com itens segue o cursor único mantido pelo servidor pra ESSA
  // playlist — a 1ª tela a pedir o estado ancora o cursor (item 0, começando agora); as demais
  // (do mesmo grupo, de grupos diferentes ou sem grupo nenhum) seguem, bastando apontar pra mesma
  // playlist na aba Conteúdo. Pedido explícito: "a sincronização da playlist deve acontecer
  // SEMPRE em todos os casos, independente do grupo". O avanço vem por POST em
  // /api/broadcast/output/:token/sync-advance (routes/api/sync-advance).
  const primaryVideoLayer = layers.find((layer) => layer.type === "video" && readStringConfig(layer.config, "playlistId"));
  const primaryPlaylistId = primaryVideoLayer ? readStringConfig(primaryVideoLayer.config, "playlistId") : null;
  const syncItems = primaryPlaylistId ? (playlistItemsByPlaylistId[primaryPlaylistId] ?? []) : [];
  let sync: BroadcastOutputState["sync"] = null;
  if (primaryPlaylistId && syncItems.length > 0) {
    const cursor = ensureSyncCursor(primaryPlaylistId, syncItems[0].id);
    let position = syncItems.findIndex((item) => item.id === cursor.itemId);
    const active = position === -1 ? (resetSyncCursor(primaryPlaylistId), ensureSyncCursor(primaryPlaylistId, syncItems[0].id)) : cursor;
    if (position === -1) position = 0;
    sync = {
      playlistId: primaryPlaylistId,
      itemIndex: position,
      itemId: active.itemId,
      elapsedMs: Math.max(0, Date.now() - active.startedAtMs),
    };
  }

  // Horário de funcionamento: fora da janela → modo espera automático. O toggle manual (offline)
  // vence por cima. effectiveOffline substitui output.offline daqui pra frente.
  const effectiveOffline =
    output.offline ||
    !isWithinActiveHours(output.activeDays, output.activeStartMinute, output.activeEndMinute, new Date(), timeZone);

  // Fallback de conteúdo: resolvido só se configurado — a view usa quando não há conteúdo tocável.
  const fallbackUrl = output.fallbackMediaAssetId ? await resolveMediaAssetUrl(output.fallbackMediaAssetId) : null;

  // Takeover — filtrado por target da saída (null/grupo/tela), sempre consultado (uma query barata). A view mostra por
  // cima de TUDO, inclusive modo espera.
  const takeover = await findActiveTakeover({ id: output.id, groupName: output.groupName });
  const takeoverMediaUrl = takeover?.mediaAssetId ? await resolveMediaAssetUrl(takeover.mediaAssetId) : null;

  const resolvedAssetUrlByLayerId: Record<string, string> = {};
  for (const layer of layers) {
    if (layer.type !== "image") continue;
    const mediaAssetId = readStringConfig(layer.config, "mediaAssetId");
    if (!mediaAssetId) continue;
    const asset = await getMediaAsset({ id: mediaAssetId });
    if (asset.success && asset.data) {
      resolvedAssetUrlByLayerId[layer.id] = asset.data.url;
    }
  }

  // Relógio+clima migraram da coluna de agenda pra BrandFooterBar (rodapé de altura fixa, nível do
  // canvas — ver layer-renderer.tsx) — essa barra agora é uma propriedade da SAÍDA (output.footerOpen),
  // não mais aninhada dentro da camada "video", então "precisa de clima" depende do footer estar
  // aberto, não de existir uma layer "video". "info" continua existindo como layer dedicada à parte.
  const needsWeather = layers.some((layer) => layer.type === "info") || output.footerOpen;
  const needsNews = layers.some((layer) => layer.type === "news") || anyPlaylistHasNewsItem;
  // Além de existir na cena, a coluna de agenda só é de fato mostrada quando drawerOpen=true (ver
  // LayerRenderer) — resolver a rotação/logo com a coluna fechada seria trabalho desperdiçado.
  // Exceção: o ticker também consome agendaRotation, independente do estado da coluna lateral —
  // mas o ticker mora DENTRO de BrandFooterBar (pedido explícito: "o ticker deve estar dentro do
  // footer, não fora"), então só existe de fato quando footerOpen=true também; sem isso, resolver
  // a rotação seria trabalho desperdiçado do mesmo jeito.
  const needsAgenda =
    (layers.some((layer) => layer.type === "agenda") && output.drawerOpen) || (output.tickerEnabled && output.footerOpen);
  const needsAlert = layers.some((layer) => layer.type === "alert");
  // Logo da plataforma é usada tanto como fallback de agenda sem logo própria quanto na
  // BrandFooterBar quanto na StandbyScreen (Fase 11) — a tela de espera precisa da logo e da cor
  // de marca mesmo com o footer fechado, então output.offline entra nas duas condições abaixo.
  const needsBrandLogo = needsAgenda || output.footerOpen || effectiveOffline;
  const needsBrandColor = output.footerOpen || effectiveOffline;
  // Largura da agenda E altura da BrandFooterBar dependem da mesma escala (ver
  // BROADCAST_AGENDA_VIEW_SIZE_SCALE) — precisa dela sempre que qualquer uma das duas aparece.
  const needsAgendaViewSize = needsAgenda || output.footerOpen;

  const [regionWeather, regionNews, agendaRotation, activeAlert, brandLogoUrl, brandColor, agendaAnimationStyle, agendaViewSize] =
    await Promise.all([
      needsWeather ? resolveRegionWeather() : Promise.resolve(null),
      needsNews ? resolveRegionNews() : Promise.resolve([]),
      needsAgenda ? resolveAgendaRotation(output.id, timeZone) : Promise.resolve([]),
      needsAlert ? findActiveAlert({ id: output.id, groupName: output.groupName }) : Promise.resolve(null),
      needsBrandLogo ? getBrandConfig("png").then((brand) => brand.logoUrl) : Promise.resolve(null),
      needsBrandColor ? resolveBrandColor() : Promise.resolve(BROADCAST_SETTINGS.brandColor.defaultValue),
      needsAgenda ? resolveAgendaAnimationStyle() : Promise.resolve(BROADCAST_SETTINGS.agendaAnimationStyle.defaultValue as BroadcastAgendaAnimationStyle),
      needsAgendaViewSize
        ? resolveAgendaViewSize()
        : Promise.resolve(BROADCAST_SETTINGS.agendaViewSize.defaultValue as BroadcastAgendaViewSize),
    ]);

  return {
    success: true,
    data: {
      outputId: output.id,
      drawerOpen: output.drawerOpen,
      footerOpen: output.footerOpen,
      offline: effectiveOffline,
      frozen: output.frozen,
      tickerEnabled: output.tickerEnabled,
      hasPlayableContent,
      fallbackUrl,
      fallbackMessage: output.fallbackMessage,
      takeoverMessage: takeover?.message ?? null,
      takeoverMediaUrl,
      takeoverExpiresAt: takeover ? takeover.expiresAt.toISOString() : null,
      scene,
      layers,
      playlistItemsByPlaylistId,
      resolvedAssetUrlByLayerId,
      regionWeather,
      regionNews,
      agendaRotation,
      activeAlertMessage: activeAlert?.message ?? null,
      activeAlertExpiresAt: activeAlert ? activeAlert.expiresAt.toISOString() : null,
      brandLogoUrl,
      brandColor,
      agendaAnimationStyle,
      agendaViewSize,
      timeZone,
      agendaOpenSeconds: output.agendaOpenSeconds,
      agendaPauseSeconds: output.agendaPauseSeconds,
      sync,
    },
  };
}
