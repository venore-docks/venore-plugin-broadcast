import { listCategories as listMediaCategories, listMediaAssets, uploadMediaAsset } from "@venore/plugin-sdk/media";
import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import type { ImportReportOutcome } from "@venore/plugin-sdk/import-export";
import { broadcastBundleManifestSchema } from "../../../shared/broadcast-bundle-manifest";
// Import relativo direto de service.ts de cada feature, nunca via barrel — mesmo racional de
// export-broadcast-bundle/service.ts (ver comentário lá) e do import-course-bundle/service.ts do
// academy.
import { createAgenda } from "../../agenda/create-agenda/service";
import { createAgendaEvent } from "../../agenda/create-agenda-event/service";
import { listAgendas } from "../../agenda/list-agendas/service";
import { setAgendaOutputs } from "../../agenda/set-agenda-outputs/service";
import { addAgendaEventPlaylistItem } from "../../playlists/add-agenda-event-playlist-item/service";
import { addMediaAssetPlaylistItem } from "../../playlists/add-media-asset-playlist-item/service";
import { addNewsPlaylistItem } from "../../playlists/add-news-playlist-item/service";
import { addWebpagePlaylistItem } from "../../playlists/add-webpage-playlist-item/service";
import { createPlaylist } from "../../playlists/create-playlist/service";
import { listPlaylists } from "../../playlists/list-playlists/service";
import { togglePlaylistItemVisibility } from "../../playlists/toggle-playlist-item-visibility/service";
import { createOutput } from "../../outputs/create-output/service";
import { listOutputs } from "../../outputs/list-outputs/service";
import { setOutputAgendaSchedule } from "../../outputs/set-output-agenda-schedule/service";
import { setOutputDrawer } from "../../outputs/set-output-drawer/service";
import { setOutputFooter } from "../../outputs/set-output-footer/service";
import { setOutputOffline } from "../../outputs/set-output-offline/service";
import { setOutputPlaylist } from "../../outputs/set-output-playlist/service";
import { setOutputTicker } from "../../outputs/set-output-ticker/service";
import type {
  BroadcastImportReport,
  BroadcastImportReportLine,
  BroadcastImportReportLineKind,
  ImportBroadcastBundleCommand,
  ImportBroadcastBundleResult,
} from "./types";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildReport(lines: BroadcastImportReportLine[]): BroadcastImportReport {
  return {
    lines,
    createdCount: lines.filter((line) => line.outcome === "created").length,
    reusedCount: lines.filter((line) => line.outcome === "reused").length,
    skippedCount: lines.filter((line) => line.outcome === "skipped").length,
    failedCount: lines.filter((line) => line.outcome === "failed").length,
  };
}

// Único ponto que grava o pacote inteiro (mídia + agendas + playlists + telas) no destino —
// orquestra as outras features do próprio plugin via import relativo direto de service.ts, mais os
// barrels públicos de media. Dedupe por NOME em cada entidade de topo (agenda/playlist/tela): já
// existe uma com o mesmo nome no destino -> pulada inteira, nunca mesclada nem sobrescrita (mesmo
// racional do dedupe por slug de curso no academy, aplicado por entidade em vez de uma única raiz).
export async function importBroadcastBundle(command: ImportBroadcastBundleCommand): Promise<ImportBroadcastBundleResult> {
  const parsed = broadcastBundleManifestSchema.safeParse(command.manifest);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "broadcast.import-broadcast-bundle.invalid_manifest",
        message: "O manifest.json do pacote não tem o formato esperado (ou é de uma versão incompatível).",
      },
    };
  }
  const manifest = parsed.data;

  const handle = beginOperation({
    useCase: "broadcast.import-broadcast-bundle",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const lines: BroadcastImportReportLine[] = [];
  function record(kind: BroadcastImportReportLineKind, ref: string, outcome: ImportReportOutcome, message?: string): void {
    lines.push({ kind, ref, outcome, message });
  }

  // ---- Mídia primeiro (dependência de tudo mais) ----------------------------------------------
  const [existingMediaResult, existingCategoriesResult] = await Promise.all([listMediaAssets({}), listMediaCategories()]);
  if (!existingMediaResult.success) {
    endOperation(handle, existingMediaResult);
    return existingMediaResult;
  }
  if (!existingCategoriesResult.success) {
    endOperation(handle, existingCategoriesResult);
    return existingCategoriesResult;
  }

  const mediaIdByChecksum = new Map(existingMediaResult.data.map((asset) => [asset.checksum, asset.id]));
  const categoryIdByName = new Map(existingCategoriesResult.data.map((category) => [category.name, category.id]));

  for (const asset of manifest.mediaAssets) {
    if (mediaIdByChecksum.has(asset.checksum)) {
      record("media-asset", asset.ref, "reused", "Já existe um arquivo idêntico (mesmo checksum) no destino — reaproveitado.");
      continue;
    }

    const bytes = command.files.get(asset.file);
    if (!bytes) {
      record("media-asset", asset.ref, "failed", `Arquivo "${asset.file}" não encontrado dentro do pacote.`);
      continue;
    }

    try {
      const uploaded = await uploadMediaAsset({
        filename: asset.filename,
        contentType: asset.contentType,
        size: bytes.byteLength,
        data: bytes,
        visibility: asset.visibility,
        categoryId: asset.categoryName ? categoryIdByName.get(asset.categoryName) : undefined,
      });
      if (!uploaded.success) {
        record("media-asset", asset.ref, "failed", uploaded.error.message);
        continue;
      }
      mediaIdByChecksum.set(asset.checksum, uploaded.data.id);
      record("media-asset", asset.ref, "created");
    } catch (error) {
      record("media-asset", asset.ref, "failed", errorMessage(error));
    }
  }

  function resolveMediaId(mediaRef: string | null): string | undefined {
    return mediaRef ? mediaIdByChecksum.get(mediaRef) : undefined;
  }

  // ---- Agendas + eventos (best-effort por evento) ----------------------------------------------
  const existingAgendasResult = await listAgendas();
  if (!existingAgendasResult.success) {
    endOperation(handle, existingAgendasResult);
    return existingAgendasResult;
  }

  const existingAgendaNames = new Set(existingAgendasResult.data.map((agenda) => agenda.name));
  // Pré-semeado com as agendas JÁ existentes: quem referencia a agenda INTEIRA (vínculo tela↔agenda
  // via output.agendaRefs) pode apontar tanto pra uma criada agora quanto reaproveitada — ao
  // contrário de agendaEventIdByExportId abaixo, que só existe pra evento de agenda CRIADA aqui.
  const agendaIdByRef = new Map(existingAgendasResult.data.map((agenda) => [agenda.name, agenda.id]));
  const agendaEventIdByExportId = new Map<string, string>();
  const createdAgendaRefs = new Set<string>();

  for (const agenda of manifest.agendas) {
    if (existingAgendaNames.has(agenda.name)) {
      record("agenda", agenda.ref, "skipped", "Já existe uma agenda com este nome no destino — agenda e eventos não foram importados.");
      continue;
    }

    const createdAgenda = await createAgenda({
      name: agenda.name,
      displaySeconds: agenda.displaySeconds,
      backgroundColor: agenda.backgroundColor,
      logoMediaAssetId: resolveMediaId(agenda.logoMediaRef),
      actorId: command.actorId,
    });
    if (!createdAgenda.success) {
      record("agenda", agenda.ref, "failed", createdAgenda.error.message);
      continue;
    }

    agendaIdByRef.set(agenda.name, createdAgenda.data.id);
    createdAgendaRefs.add(agenda.ref);

    const eventNotes: string[] = [];
    for (const event of agenda.events) {
      const createdEvent = await createAgendaEvent({
        agendaId: createdAgenda.data.id,
        title: event.title,
        description: event.description,
        startAt: new Date(event.startAt),
        recurring: event.recurring,
        endAt: event.endAt ? new Date(event.endAt) : undefined,
        extraDates: event.extraDates.map((date) => ({
          startAt: new Date(date.startAt),
          endAt: date.endAt ? new Date(date.endAt) : undefined,
        })),
        coverMediaAssetId: resolveMediaId(event.coverMediaRef),
        location: event.location,
        actorId: command.actorId,
      });
      if (!createdEvent.success) {
        eventNotes.push(`Evento "${event.title}": ${createdEvent.error.message}`);
        continue;
      }
      agendaEventIdByExportId.set(event.exportId, createdEvent.data.id);
    }
    record("agenda", agenda.ref, "created", eventNotes.length > 0 ? eventNotes.join(" ") : undefined);
  }

  // ---- Playlists + itens (best-effort por item) --------------------------------------------------
  const existingPlaylistsResult = await listPlaylists();
  if (!existingPlaylistsResult.success) {
    endOperation(handle, existingPlaylistsResult);
    return existingPlaylistsResult;
  }

  const existingPlaylistNames = new Set(existingPlaylistsResult.data.map((playlist) => playlist.name));
  const playlistIdByRef = new Map(existingPlaylistsResult.data.map((playlist) => [playlist.name, playlist.id]));

  for (const playlist of manifest.playlists) {
    if (existingPlaylistNames.has(playlist.name)) {
      record("playlist", playlist.ref, "skipped", "Já existe uma playlist com este nome no destino — playlist e itens não foram importados.");
      continue;
    }

    const createdPlaylist = await createPlaylist({ name: playlist.name, actorId: command.actorId });
    if (!createdPlaylist.success) {
      record("playlist", playlist.ref, "failed", createdPlaylist.error.message);
      continue;
    }
    playlistIdByRef.set(playlist.name, createdPlaylist.data.id);

    const itemNotes: string[] = [];
    for (const item of playlist.items) {
      const itemLabel = item.title ?? item.sourceType;

      const itemResult = await (async () => {
        if (item.sourceType === "media-asset") {
          const mediaId = resolveMediaId(item.mediaRef);
          if (!mediaId) return { success: false as const, error: { message: "arquivo de mídia não disponível no destino." } };
          return addMediaAssetPlaylistItem({
            playlistId: createdPlaylist.data.id,
            mediaAssetId: mediaId,
            title: item.title,
            durationSeconds: item.durationSeconds,
            withAudio: item.withAudio,
            actorId: command.actorId,
          });
        }
        if (item.sourceType === "webpage") {
          if (!item.url) return { success: false as const, error: { message: "URL ausente." } };
          return addWebpagePlaylistItem({
            playlistId: createdPlaylist.data.id,
            url: item.url,
            title: item.title,
            durationSeconds: item.durationSeconds,
            withAudio: item.withAudio,
            actorId: command.actorId,
          });
        }
        if (item.sourceType === "news") {
          return addNewsPlaylistItem({
            playlistId: createdPlaylist.data.id,
            title: item.title,
            durationSeconds: item.durationSeconds,
            actorId: command.actorId,
          });
        }
        const agendaEventId = item.agendaEventRef ? agendaEventIdByExportId.get(item.agendaEventRef) : undefined;
        if (!agendaEventId) {
          return {
            success: false as const,
            error: {
              message:
                "evento de agenda não disponível no destino (a agenda dona já existia e foi pulada, ou o evento falhou ao importar).",
            },
          };
        }
        return addAgendaEventPlaylistItem({
          playlistId: createdPlaylist.data.id,
          agendaEventId,
          title: item.title,
          durationSeconds: item.durationSeconds,
          actorId: command.actorId,
        });
      })();

      if (!itemResult.success) {
        itemNotes.push(`Item "${itemLabel}": ${itemResult.error.message}`);
        continue;
      }
      if (item.hidden) {
        const toggled = await togglePlaylistItemVisibility({ itemId: itemResult.data.id, hidden: true });
        if (!toggled.success) itemNotes.push(`Item "${itemLabel}": criado, mas falhou ao marcar como oculto — ${toggled.error.message}`);
      }
    }
    record("playlist", playlist.ref, "created", itemNotes.length > 0 ? itemNotes.join(" ") : undefined);
  }

  // ---- Telas -------------------------------------------------------------------------------------
  const existingOutputsResult = await listOutputs();
  if (!existingOutputsResult.success) {
    endOperation(handle, existingOutputsResult);
    return existingOutputsResult;
  }
  const existingOutputNames = new Set(existingOutputsResult.data.map((output) => output.name));

  // Vínculo agenda↔tela só é aplicado pra agenda CRIADA nesta importação (createdAgendaRefs) — ver
  // comentário no topo do arquivo e no plano da sessão: setAgendaOutputs substitui o conjunto
  // inteiro de telas vinculadas, chamá-lo numa agenda reaproveitada apagaria vínculos que essa
  // importação não conhece.
  const newOutputIdsByAgendaRef = new Map<string, string[]>();

  for (const output of manifest.outputs) {
    if (existingOutputNames.has(output.name)) {
      record("output", output.ref, "skipped", "Já existe uma tela com este nome no destino.");
      continue;
    }

    const playlistId = output.playlistRef ? playlistIdByRef.get(output.playlistRef) : undefined;
    if (!playlistId) {
      record("output", output.ref, "failed", `Playlist "${output.playlistRef ?? "(nenhuma)"}" não disponível no destino.`);
      continue;
    }

    // Toda tela nasce com playlist dedicada 1:1 (createOutput não aceita mais playlistId). O bundle
    // traz a playlist explícita da tela — reaponta a tela pra ela logo em seguida; a playlist
    // dedicada recém-criada fica sem uso (mesmo caso de quem aponta a tela pra outra playlist na UI).
    const createdOutput = await createOutput({ name: output.name, template: "completo", actorId: command.actorId });
    if (!createdOutput.success) {
      record("output", output.ref, "failed", createdOutput.error.message);
      continue;
    }
    const outputId = createdOutput.data.id;
    const notes: string[] = [];

    const attachPlaylistResult = await setOutputPlaylist({ outputId, playlistId, actorId: command.actorId });
    if (!attachPlaylistResult.success) notes.push(`Playlist: ${attachPlaylistResult.error.message}`);

    const footerResult = await setOutputFooter({ outputId, footerOpen: output.footerOpen, actorId: command.actorId });
    if (!footerResult.success) notes.push(`Rodapé: ${footerResult.error.message}`);

    const drawerResult = await setOutputDrawer({ outputId, drawerOpen: output.drawerOpen, actorId: command.actorId });
    if (!drawerResult.success) notes.push(`Agenda (coluna lateral): ${drawerResult.error.message}`);

    const tickerResult = await setOutputTicker({ outputId, tickerEnabled: output.tickerEnabled, actorId: command.actorId });
    if (!tickerResult.success) notes.push(`Ticker: ${tickerResult.error.message}`);

    const scheduleResult = await setOutputAgendaSchedule({
      outputId,
      agendaOpenSeconds: output.agendaOpenSeconds,
      agendaPauseSeconds: output.agendaPauseSeconds,
      actorId: command.actorId,
    });
    if (!scheduleResult.success) notes.push(`Ciclo de agenda: ${scheduleResult.error.message}`);

    if (output.offline) {
      const offlineResult = await setOutputOffline({ outputId, offline: true, actorId: command.actorId });
      if (!offlineResult.success) notes.push(`Offline: ${offlineResult.error.message}`);
    }

    for (const agendaRef of output.agendaRefs) {
      if (!createdAgendaRefs.has(agendaRef)) {
        notes.push(`Vínculo com agenda "${agendaRef}": agenda já existia no destino — vincule manualmente em Agenda → "Onde aparece".`);
        continue;
      }
      const bucket = newOutputIdsByAgendaRef.get(agendaRef) ?? [];
      bucket.push(outputId);
      newOutputIdsByAgendaRef.set(agendaRef, bucket);
    }

    record("output", output.ref, "created", notes.length > 0 ? notes.join(" ") : undefined);
  }

  // ---- Vínculo agenda↔tela (só agenda criada nesta importação, ver comentário acima) -------------
  for (const [agendaRef, outputIds] of newOutputIdsByAgendaRef) {
    const agendaId = agendaIdByRef.get(agendaRef);
    if (!agendaId) continue; // não deveria acontecer — defesa em profundidade
    const linked = await setAgendaOutputs({ agendaId, outputIds, actorId: command.actorId });
    if (!linked.success) {
      record("agenda", agendaRef, "failed", `Falha ao vincular telas importadas: ${linked.error.message}`);
    }
  }

  const report = buildReport(lines);
  endOperation(handle, { success: true });
  return { success: true, data: report };
}
