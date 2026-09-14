import type { OperationResult } from "@venore/plugin-sdk";
import { updatePlaylistItem } from "../../playlists/update-playlist-item/service";
import { deletePlaylistItem } from "../../playlists/delete-playlist-item/service";
import { reorderPlaylistItemsService } from "../../playlists/reorder-playlist-items/service";
import { togglePlaylistItemVisibility } from "../../playlists/toggle-playlist-item-visibility/service";
import { addWebpagePlaylistItem } from "../../playlists/add-webpage-playlist-item/service";
import { addMediaAssetPlaylistItem } from "../../playlists/add-media-asset-playlist-item/service";
import { addNewsPlaylistItem } from "../../playlists/add-news-playlist-item/service";
import { addAgendaEventPlaylistItem } from "../../playlists/add-agenda-event-playlist-item/service";
import { addMetricsBoardPlaylistItem } from "../../playlists/add-metrics-board-playlist-item/service";
import { addScannedPlaylistItems } from "../../playlists/add-scanned-playlist-items/service";
import { publishAlert } from "../../alerts/publish-alert/service";
import { publishTakeover } from "../../takeover/publish-takeover/service";
import { CONTENT_CHANGE_USE_CASES } from "./use-cases";

// Registro central que faz a aprovação de uma mudança pendente de fato ACONTECER — approve-
// content-change chama CONTENT_CHANGE_APPLIERS[change.useCase](change.payload) e é só isso: o
// service.ts de cada feature já é a função "aplica esta intenção" de sempre (a mesma chamada que
// aconteceria na hora se o ator tivesse broadcast.manage), sem lógica de escrita duplicada aqui.
//
// `any` no parâmetro é deliberado: o payload vem de volta de um JSONB depois de um round-trip por
// aprovação que pode acontecer bem depois da submissão original — não dá pra tipar estaticamente
// contra os 12 formatos de comando diferentes. A garantia de forma é em runtime, pelas mesmas
// validações que cada service já faz (findPlaylistItemById retornando null, checks de shape etc.).
type ContentChangeApplier = (payload: any) => Promise<OperationResult<unknown>>;

export const CONTENT_CHANGE_APPLIERS: Record<string, ContentChangeApplier> = {
  [CONTENT_CHANGE_USE_CASES.updatePlaylistItem]: updatePlaylistItem,
  [CONTENT_CHANGE_USE_CASES.deletePlaylistItem]: deletePlaylistItem,
  [CONTENT_CHANGE_USE_CASES.reorderPlaylistItems]: reorderPlaylistItemsService,
  [CONTENT_CHANGE_USE_CASES.togglePlaylistItemVisibility]: togglePlaylistItemVisibility,
  [CONTENT_CHANGE_USE_CASES.addWebpagePlaylistItem]: addWebpagePlaylistItem,
  [CONTENT_CHANGE_USE_CASES.addMediaAssetPlaylistItem]: addMediaAssetPlaylistItem,
  [CONTENT_CHANGE_USE_CASES.addNewsPlaylistItem]: addNewsPlaylistItem,
  [CONTENT_CHANGE_USE_CASES.addAgendaEventPlaylistItem]: addAgendaEventPlaylistItem,
  [CONTENT_CHANGE_USE_CASES.addMetricsBoardPlaylistItem]: addMetricsBoardPlaylistItem,
  [CONTENT_CHANGE_USE_CASES.addScannedPlaylistItems]: addScannedPlaylistItems,
  [CONTENT_CHANGE_USE_CASES.publishAlert]: publishAlert,
  [CONTENT_CHANGE_USE_CASES.publishTakeover]: publishTakeover,
};
