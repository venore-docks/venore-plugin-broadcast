import { z } from "zod";
import type { MediaVisibility } from "@venore/plugin-sdk/media";
import {
  SLIDESHOW_MOTIONS,
  SLIDESHOW_MOTION_STRENGTHS,
  SLIDESHOW_TRANSITIONS,
  SLIDESHOW_TRANSITION_MAX_MS,
  SLIDESHOW_TRANSITION_MIN_MS,
  type BroadcastPlaylistSlideshow,
} from "./slideshow";

// Formato do pacote de export/import (telas + playlists + agenda) do Broadcast Studio — mesma
// ideia de contexts/import-export/contracts/types.ts (IMPORT_EXPORT_FORMAT/_VERSION) e de
// venore-plugin-academy/shared/course-bundle-manifest.ts (ACADEMY_COURSE_BUNDLE_FORMAT), versão
// própria porque o shape (telas/playlists/agenda com referências cruzadas entre si) não tem nada
// a ver com nenhum dos dois. Só muda quando o SHAPE do manifest quebra leitura por um importador
// de versão anterior.
export const BROADCAST_BUNDLE_FORMAT = "venore-broadcast";
export const BROADCAST_BUNDLE_FORMAT_VERSION = 1;

// Gate AND (não OR de authorizeActor) dos dois handlers de export/import — mesmo racional de
// ACADEMY_COURSE_BUNDLE_REQUIRED_PERMISSIONS: media.manage porque o pacote lê/grava bytes de
// mídia, que broadcast.manage sozinho não autoriza.
export const BROADCAST_BUNDLE_REQUIRED_PERMISSIONS = ["broadcast.manage", "media.manage"] as const;

// Toda referência de mídia é por checksum (sha256 do conteúdo), nunca id de banco — id não
// sobrevive a uma exportação pra outra instalação. Um item de playlist "local" (arquivo em
// public/broadcast/videos, não portável por caminho entre servidores) também vira uma entrada
// aqui no export — ver export-broadcast-bundle/service.ts.
export type ExportedMediaAsset = {
  ref: string;
  filename: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  alt: string | null;
  checksum: string;
  visibility: MediaVisibility;
  categoryName: string | null;
  // Caminho do arquivo dentro do zip (assets/<checksum>-<filename sanitizado>).
  file: string;
};

export type ExportedAgendaEventDate = { startAt: string; endAt: string | null };

// exportId é sintético (crypto.randomUUID() no export), único só dentro deste pacote — mesmo
// espírito de ExportedMenuItem.exportId em contexts/import-export/contracts/types.ts. É o que um
// item de playlist sourceType "agenda-event" referencia (agendaEventRef). Só resolve no import
// quando a agenda dona do evento foi CRIADA nesta importação (não reaproveitada) — ver comentário
// em import-broadcast-bundle/service.ts.
export type ExportedAgendaEvent = {
  exportId: string;
  title: string;
  description: string | null;
  startAt: string;
  recurring: boolean;
  endAt: string | null;
  coverMediaRef: string | null;
  location: string | null;
  extraDates: ExportedAgendaEventDate[];
};

// ref = name — chave de dedupe no import (uma agenda já existente no destino com o mesmo nome é
// pulada inteira, agenda + eventos, nunca mesclada).
export type ExportedAgenda = {
  ref: string;
  name: string;
  displaySeconds: number;
  backgroundColor: string | null;
  logoMediaRef: string | null;
  events: ExportedAgendaEvent[];
};

// Sem "order" explícito — a ordem deste array já reproduz a ordem original no import (cada
// add*PlaylistItem já atribui a próxima posição automaticamente), mesmo racional do academy.
// "local" nunca aparece aqui — sempre normalizado pra "media-asset" no export (ver comentário no
// plano/service).
export type ExportedPlaylistItemSourceType = "media-asset" | "webpage" | "news" | "agenda-event";
export type ExportedPlaylistItem = {
  sourceType: ExportedPlaylistItemSourceType;
  title: string | null;
  mediaRef: string | null;
  url: string | null;
  agendaEventRef: string | null;
  durationSeconds: number | null;
  hidden: boolean;
  withAudio: boolean;
};

export type ExportedPlaylist = {
  ref: string;
  name: string;
  // Estilo do slideshow de imagens (v1.10). Opcional: pacote exportado antes da v1.10 não traz — a
  // playlist importada fica no padrão (imagem parada, corte seco).
  slideshow?: BroadcastPlaylistSlideshow;
  items: ExportedPlaylistItem[];
};

// ref = name. playlistRef/agendaRefs resolvem tanto pra entidade criada quanto reaproveitada
// nesta importação (diferente de agendaEventRef acima) — apontar uma tela nova pra uma
// playlist/agenda já existente é seguro, não há operação destrutiva equivalente ao
// setAgendaOutputs de uma agenda reaproveitada (ver import-broadcast-bundle/service.ts).
export type ExportedOutput = {
  ref: string;
  name: string;
  playlistRef: string | null;
  agendaRefs: string[];
  drawerOpen: boolean;
  footerOpen: boolean;
  tickerEnabled: boolean;
  agendaOpenSeconds: number | null;
  agendaPauseSeconds: number | null;
  offline: boolean;
};

export type BroadcastBundleManifest = {
  format: typeof BROADCAST_BUNDLE_FORMAT;
  formatVersion: typeof BROADCAST_BUNDLE_FORMAT_VERSION;
  exportedAt: string;
  mediaAssets: ExportedMediaAsset[];
  agendas: ExportedAgenda[];
  playlists: ExportedPlaylist[];
  outputs: ExportedOutput[];
};

const mediaVisibilitySchema = z.enum(["public", "restricted", "private"]);

const exportedMediaAssetSchema = z.object({
  ref: z.string().min(1),
  filename: z.string().min(1),
  contentType: z.string().min(1),
  size: z.number().nonnegative(),
  width: z.number().nullable(),
  height: z.number().nullable(),
  alt: z.string().nullable(),
  checksum: z.string().min(1),
  visibility: mediaVisibilitySchema,
  categoryName: z.string().nullable(),
  file: z.string().min(1),
});

const exportedAgendaEventDateSchema = z.object({ startAt: z.string(), endAt: z.string().nullable() });

const exportedAgendaEventSchema = z.object({
  exportId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().nullable(),
  startAt: z.string(),
  recurring: z.boolean(),
  endAt: z.string().nullable(),
  coverMediaRef: z.string().nullable(),
  location: z.string().nullable(),
  extraDates: z.array(exportedAgendaEventDateSchema),
});

const exportedAgendaSchema = z.object({
  ref: z.string().min(1),
  name: z.string().min(1),
  displaySeconds: z.number().int().positive(),
  backgroundColor: z.string().nullable(),
  logoMediaRef: z.string().nullable(),
  events: z.array(exportedAgendaEventSchema),
});

const exportedPlaylistItemSchema = z.object({
  sourceType: z.enum(["media-asset", "webpage", "news", "agenda-event"]),
  title: z.string().nullable(),
  mediaRef: z.string().nullable(),
  url: z.string().nullable(),
  agendaEventRef: z.string().nullable(),
  durationSeconds: z.number().nullable(),
  hidden: z.boolean(),
  withAudio: z.boolean(),
});

const exportedSlideshowSchema = z.object({
  motion: z.enum(SLIDESHOW_MOTIONS),
  motionStrength: z.enum(SLIDESHOW_MOTION_STRENGTHS),
  transition: z.enum(SLIDESHOW_TRANSITIONS),
  transitionMs: z.number().int().min(SLIDESHOW_TRANSITION_MIN_MS).max(SLIDESHOW_TRANSITION_MAX_MS),
});

const exportedPlaylistSchema = z.object({
  ref: z.string().min(1),
  name: z.string().min(1),
  slideshow: exportedSlideshowSchema.optional(),
  items: z.array(exportedPlaylistItemSchema),
});

const exportedOutputSchema = z.object({
  ref: z.string().min(1),
  name: z.string().min(1),
  playlistRef: z.string().nullable(),
  agendaRefs: z.array(z.string()),
  drawerOpen: z.boolean(),
  footerOpen: z.boolean(),
  tickerEnabled: z.boolean(),
  agendaOpenSeconds: z.number().nullable(),
  agendaPauseSeconds: z.number().nullable(),
  offline: z.boolean(),
});

// Validação de fronteira do pacote não confiável (.zip enviado pelo admin) antes de qualquer
// gravação — mesmo raciocínio de academyCourseBundleManifestSchema/exportManifestSchema.
export const broadcastBundleManifestSchema = z.object({
  format: z.literal(BROADCAST_BUNDLE_FORMAT),
  formatVersion: z.literal(BROADCAST_BUNDLE_FORMAT_VERSION),
  exportedAt: z.string(),
  mediaAssets: z.array(exportedMediaAssetSchema),
  agendas: z.array(exportedAgendaSchema),
  playlists: z.array(exportedPlaylistSchema),
  outputs: z.array(exportedOutputSchema),
});
