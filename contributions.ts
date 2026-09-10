import { eq, inArray } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import type { MediaUsageReference, PluginContributions } from "@venore/plugin-sdk";
import { broadcastAgendaEvents, broadcastAgendas, broadcastPlaylistItems, broadcastPlaylists } from "./database/schema";

// O que o Broadcast Studio contribui pro core. Hoje só o `mediaUsageResolver`: o plugin referencia
// mídia por id cru sem FK (regra 7/8 do AGENTS.md — playlist_items.mediaAssetId,
// agendas.logoMediaAssetId, agenda_events.coverMediaAssetId), então sem isto apagar um asset usado
// aqui quebrava a referência em silêncio. Com o resolver, /admin/media mostra "usado por: Broadcast
// Studio" antes de apagar. O plugin só tem UMA página de admin (/admin/broadcast), então todos os
// href apontam pra ela — não há deep-link por playlist/agenda.
const ADMIN_HREF = "/admin/broadcast";
const CONSUMER = { consumerKey: "broadcast", consumerLabel: "Broadcast Studio" } as const;

async function resolveBroadcastMediaUsage(mediaId: string): Promise<MediaUsageReference[]> {
  const references: MediaUsageReference[] = [];

  // Itens de playlist "media-asset" (2 queries + agrupamento em JS, sem join — mesmo idioma do
  // resto do plugin).
  const items = await db
    .select({ playlistId: broadcastPlaylistItems.playlistId })
    .from(broadcastPlaylistItems)
    .where(eq(broadcastPlaylistItems.mediaAssetId, mediaId));
  if (items.length > 0) {
    const playlistIds = [...new Set(items.map((item) => item.playlistId))];
    const names = await db
      .select({ id: broadcastPlaylists.id, name: broadcastPlaylists.name })
      .from(broadcastPlaylists)
      .where(inArray(broadcastPlaylists.id, playlistIds));
    const nameById = new Map(names.map((row) => [row.id, row.name]));
    for (const item of items) {
      references.push({ ...CONSUMER, label: `Playlist "${nameById.get(item.playlistId) ?? "?"}": item de mídia`, href: ADMIN_HREF });
    }
  }

  const agendas = await db
    .select({ name: broadcastAgendas.name })
    .from(broadcastAgendas)
    .where(eq(broadcastAgendas.logoMediaAssetId, mediaId));
  for (const agenda of agendas) {
    references.push({ ...CONSUMER, label: `Agenda "${agenda.name}": logo`, href: ADMIN_HREF });
  }

  const events = await db
    .select({ title: broadcastAgendaEvents.title })
    .from(broadcastAgendaEvents)
    .where(eq(broadcastAgendaEvents.coverMediaAssetId, mediaId));
  for (const event of events) {
    references.push({ ...CONSUMER, label: `Evento "${event.title}": imagem de capa`, href: ADMIN_HREF });
  }

  return references;
}

export const broadcastContributions: PluginContributions = {
  mediaUsageResolver: resolveBroadcastMediaUsage,
};
