import { createHash, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { getMediaAsset, listCategories as listMediaCategories } from "@venore/plugin-sdk/media";
import { resolveOutputPlaylistIds } from "../../../components/admin/resolve-output-playlist-ids";
// Import relativo direto de service.ts de cada feature, nunca via barrel (index.ts) — um plugin
// não se auto-importa pelo próprio barrel (mesmo padrão de export-course-bundle/service.ts do
// academy: "orquestra as outras features do próprio plugin via import relativo direto").
import { listAgendaEvents } from "../../agenda/list-agenda-events/service";
import { listAgendaOutputs } from "../../agenda/list-agenda-outputs/service";
import { listAgendas } from "../../agenda/list-agendas/service";
import { listOutputs } from "../../outputs/list-outputs/service";
import { listPlaylistItems } from "../../playlists/list-playlist-items/service";
import { listPlaylists } from "../../playlists/list-playlists/service";
import { resolveStreamableItem } from "../../playlists/resolve-streamable-playlist-item/service";
import {
  BROADCAST_BUNDLE_FORMAT,
  BROADCAST_BUNDLE_FORMAT_VERSION,
  type BroadcastBundleManifest,
  type ExportedAgenda,
  type ExportedAgendaEvent,
  type ExportedMediaAsset,
  type ExportedOutput,
  type ExportedPlaylist,
  type ExportedPlaylistItem,
  type ExportedPlaylistItemSourceType,
} from "../../../shared/broadcast-bundle-manifest";
import type { BroadcastAgendaEventRecord, BroadcastPlaylistItemRecord } from "../../../contracts/types";
import type { ExportBroadcastBundleAssetFile, ExportBroadcastBundleResult } from "./types";

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}

async function downloadAssetBytes(url: string): Promise<Buffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar mídia de "${url}" (HTTP ${response.status}).`);
  }
  return Buffer.from(await response.arrayBuffer());
}

// Único ponto que sabe montar o pacote inteiro (manifest + bytes de mídia) — orquestra as outras
// features do próprio plugin via barrel (index.ts, mesmo padrão de qualquer outro consumidor
// dentro do plugin — regra 7/8 do AGENTS.md só proíbe pular o barrel de OUTRO context/plugin) mais
// os barrels públicos de media, e resolveOutputPlaylistIds (components/admin/, já usado por
// routes/admin/page.tsx pro mesmo propósito: achar qual playlist uma saída toca, que mora na
// config da camada "video", não numa coluna direta de outputs).
// outputIds: filtro opcional (backlog item 14 — "exportar/duplicar config de tela pra outro
// ambiente"). Sem filtro, exporta a instalação inteira (comportamento original, usado pela aba
// Importar/Exportar). Com filtro, o pacote sai enxuto — só as telas pedidas + só as playlists e
// agendas que ELAS de fato usam (não a biblioteca inteira), pra "exportar uma tela" não vazar
// configuração de outras telas do ambiente de origem sem necessidade.
export async function exportBroadcastBundle(options: { outputIds?: string[] } = {}): Promise<ExportBroadcastBundleResult> {
  const [agendasResult, agendaEventsResult, playlistsResult, outputsResult, agendaOutputsResult, categoriesResult] = await Promise.all([
    listAgendas(),
    listAgendaEvents(),
    listPlaylists(),
    listOutputs(),
    listAgendaOutputs(),
    listMediaCategories(),
  ]);
  if (!agendasResult.success) return agendasResult;
  if (!agendaEventsResult.success) return agendaEventsResult;
  if (!playlistsResult.success) return playlistsResult;
  if (!outputsResult.success) return outputsResult;
  if (!agendaOutputsResult.success) return agendaOutputsResult;
  if (!categoriesResult.success) return categoriesResult;

  let outputs = outputsResult.data;
  if (options.outputIds && options.outputIds.length > 0) {
    const wantedOutputIds = new Set(options.outputIds);
    outputs = outputs.filter((output) => wantedOutputIds.has(output.id));
    if (outputs.length === 0) {
      return {
        success: false,
        error: { code: "broadcast.export-broadcast-bundle.output_not_found", message: "Tela não encontrada." },
      };
    }
  }
  const outputIdsForFilter = options.outputIds && options.outputIds.length > 0 ? new Set(outputs.map((output) => output.id)) : null;

  const outputPlaylistById = await resolveOutputPlaylistIds(outputs);
  const playlists = outputIdsForFilter
    ? playlistsResult.data.filter((playlist) => Object.values(outputPlaylistById).includes(playlist.id))
    : playlistsResult.data;
  const agendaOutputIdsByAgendaId = agendaOutputsResult.data;
  const agendas = outputIdsForFilter
    ? agendasResult.data.filter((agenda) =>
        (agendaOutputIdsByAgendaId[agenda.id] ?? []).some((linkedOutputId) => outputIdsForFilter.has(linkedOutputId)),
      )
    : agendasResult.data;
  const categoryNameById = new Map(categoriesResult.data.map((category) => [category.id, category.name]));

  const eventsByAgendaId = new Map<string, BroadcastAgendaEventRecord[]>();
  for (const event of agendaEventsResult.data) {
    const bucket = eventsByAgendaId.get(event.agendaId) ?? [];
    bucket.push(event);
    eventsByAgendaId.set(event.agendaId, bucket);
  }

  const itemsByPlaylistId = new Map<string, BroadcastPlaylistItemRecord[]>();
  for (const playlist of playlists) {
    const itemsResult = await listPlaylistItems({ playlistId: playlist.id });
    if (!itemsResult.success) return itemsResult;
    itemsByPlaylistId.set(playlist.id, itemsResult.data);
  }

  // ---- Mídia: coletada sob demanda conforme os passos abaixo referenciam algo, dedupe por
  // checksum (dois itens/agendas apontando pro mesmo arquivo não duplicam asset no pacote). ----
  const mediaAssets: ExportedMediaAsset[] = [];
  const files: ExportBroadcastBundleAssetFile[] = [];
  const refByMediaAssetId = new Map<string, string>();
  const seenChecksums = new Set<string>();

  function addAssetOnce(entry: ExportedMediaAsset, data: Buffer): void {
    if (seenChecksums.has(entry.checksum)) return;
    seenChecksums.add(entry.checksum);
    mediaAssets.push(entry);
    files.push({ path: entry.file, data });
  }

  // mediaAssetId de verdade (linha em media.assets) — usado por logo de agenda/capa de evento e
  // item de playlist "media-asset". Referência órfã (mídia apagada) devolve null sem travar o
  // export, mesmo racional do academy.
  async function ensureMediaAssetRef(mediaAssetId: string): Promise<string | null> {
    const cached = refByMediaAssetId.get(mediaAssetId);
    if (cached) return cached;

    const assetResult = await getMediaAsset({ id: mediaAssetId });
    if (!assetResult.success || !assetResult.data) return null;
    const asset = assetResult.data;
    refByMediaAssetId.set(mediaAssetId, asset.checksum);

    const filePath = `assets/${asset.checksum}-${sanitizeFilename(asset.filename)}`;
    addAssetOnce(
      {
        ref: asset.checksum,
        filename: asset.filename,
        contentType: asset.contentType,
        size: asset.size,
        width: asset.width,
        height: asset.height,
        alt: asset.alt,
        checksum: asset.checksum,
        visibility: asset.visibility,
        categoryName: asset.categoryId ? (categoryNameById.get(asset.categoryId) ?? null) : null,
        file: filePath,
      },
      await downloadAssetBytes(asset.url),
    );
    return asset.checksum;
  }

  // Item de playlist "local" (arquivo em public/broadcast/videos, não portável por caminho entre
  // servidores) — lê os bytes via o MESMO resolveStreamableItem que a rota de stream usa, calcula
  // o checksum e vira um asset comum no pacote (sourceType exportado sempre "media-asset", nunca
  // "local" — ver comentário no manifest).
  async function ensureLocalFileRef(itemId: string): Promise<string | null> {
    const resolved = await resolveStreamableItem({ itemId });
    if (!resolved.success || resolved.data.kind !== "local") return null;

    const bytes = await readFile(resolved.data.absolutePath);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const filename = path.basename(resolved.data.absolutePath);
    const filePath = `assets/${checksum}-${sanitizeFilename(filename)}`;

    addAssetOnce(
      {
        ref: checksum,
        filename,
        contentType: resolved.data.contentType,
        size: resolved.data.size,
        width: null,
        height: null,
        alt: null,
        checksum,
        // Arquivo local era servido sem controle de acesso próprio (rota do plugin, sem sessão) —
        // "public" é o mais próximo do comportamento original depois de virar media-asset de
        // verdade.
        visibility: "public",
        categoryName: null,
        file: filePath,
      },
      bytes,
    );
    return checksum;
  }

  // ---- Agendas + eventos ----
  const exportedAgendas: ExportedAgenda[] = [];
  const eventExportIdByEventId = new Map<string, string>();

  for (const agenda of agendas) {
    const logoMediaRef = agenda.logoMediaAssetId ? await ensureMediaAssetRef(agenda.logoMediaAssetId) : null;
    const events = eventsByAgendaId.get(agenda.id) ?? [];
    const exportedEvents: ExportedAgendaEvent[] = [];

    for (const event of events) {
      const exportId = randomUUID();
      eventExportIdByEventId.set(event.id, exportId);
      const coverMediaRef = event.coverMediaAssetId ? await ensureMediaAssetRef(event.coverMediaAssetId) : null;
      exportedEvents.push({
        exportId,
        title: event.title,
        description: event.description,
        startAt: event.startAt.toISOString(),
        recurring: event.recurring,
        endAt: event.endAt ? event.endAt.toISOString() : null,
        coverMediaRef,
        location: event.location,
        extraDates: event.extraDates.map((date) => ({
          startAt: date.startAt.toISOString(),
          endAt: date.endAt ? date.endAt.toISOString() : null,
        })),
      });
    }

    exportedAgendas.push({
      ref: agenda.name,
      name: agenda.name,
      displaySeconds: agenda.displaySeconds,
      backgroundColor: agenda.backgroundColor,
      logoMediaRef,
      events: exportedEvents,
    });
  }

  // ---- Playlists + itens ----
  const exportedPlaylists: ExportedPlaylist[] = [];

  for (const playlist of playlists) {
    const items = itemsByPlaylistId.get(playlist.id) ?? [];
    const exportedItems: ExportedPlaylistItem[] = [];

    for (const item of items) {
      let sourceType: ExportedPlaylistItemSourceType;
      let mediaRef: string | null = null;
      let url: string | null = null;
      let agendaEventRef: string | null = null;

      if (item.sourceType === "media-asset" && item.mediaAssetId) {
        sourceType = "media-asset";
        mediaRef = await ensureMediaAssetRef(item.mediaAssetId);
      } else if (item.sourceType === "local") {
        sourceType = "media-asset";
        mediaRef = await ensureLocalFileRef(item.id);
      } else if (item.sourceType === "webpage") {
        sourceType = "webpage";
        url = item.url;
      } else if (item.sourceType === "news") {
        sourceType = "news";
      } else if (item.sourceType === "agenda-event" && item.agendaEventId) {
        sourceType = "agenda-event";
        agendaEventRef = eventExportIdByEventId.get(item.agendaEventId) ?? null;
      } else {
        // Não deveria acontecer (CHECK de schema garante a forma certa por sourceType) — defesa em
        // profundidade, item sem referência resolvível simplesmente não entra no pacote.
        continue;
      }

      exportedItems.push({
        sourceType,
        title: item.title,
        mediaRef,
        url,
        agendaEventRef,
        durationSeconds: item.durationSeconds,
        hidden: item.hidden,
        withAudio: item.withAudio,
      });
    }

    exportedPlaylists.push({ ref: playlist.name, name: playlist.name, items: exportedItems });
  }

  // ---- Telas ----
  const agendaRefsByOutputId = new Map<string, string[]>();
  for (const agenda of agendas) {
    for (const outputId of agendaOutputIdsByAgendaId[agenda.id] ?? []) {
      const bucket = agendaRefsByOutputId.get(outputId) ?? [];
      bucket.push(agenda.name);
      agendaRefsByOutputId.set(outputId, bucket);
    }
  }
  const playlistNameById = new Map(playlists.map((playlist) => [playlist.id, playlist.name]));

  const exportedOutputs: ExportedOutput[] = outputs.map((output) => {
    const playlistId = outputPlaylistById[output.id];
    return {
      ref: output.name,
      name: output.name,
      playlistRef: playlistId ? (playlistNameById.get(playlistId) ?? null) : null,
      agendaRefs: agendaRefsByOutputId.get(output.id) ?? [],
      drawerOpen: output.drawerOpen,
      footerOpen: output.footerOpen,
      tickerEnabled: output.tickerEnabled,
      agendaOpenSeconds: output.agendaOpenSeconds,
      agendaPauseSeconds: output.agendaPauseSeconds,
      offline: output.offline,
    };
  });

  const manifest: BroadcastBundleManifest = {
    format: BROADCAST_BUNDLE_FORMAT,
    formatVersion: BROADCAST_BUNDLE_FORMAT_VERSION,
    exportedAt: new Date().toISOString(),
    mediaAssets,
    agendas: exportedAgendas,
    playlists: exportedPlaylists,
    outputs: exportedOutputs,
  };

  return { success: true, data: { manifest, files } };
}
