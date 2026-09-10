import { asc, eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import {
  broadcastLayers,
  broadcastOutputs,
  broadcastPlaylistItems,
  broadcastPlaylists,
  broadcastScenes,
} from "../../../database/schema";
import { slugifyOutputName } from "../../../shared/output-token";
import type { BroadcastOutputRecord } from "../../../contracts/types";

const MAX_SLUG_ATTEMPTS = 50;

// Duplicado do resolveUniqueToken de create-output/store.ts (mesma janela de corrida aceitável pra
// ferramenta de admin) — importar entre slices de feature não é o padrão do plugin.
async function resolveUniqueToken(name: string): Promise<string> {
  const base = slugifyOutputName(name);
  const existing = await db.select({ token: broadcastOutputs.token }).from(broadcastOutputs);
  const used = new Set(existing.map((row) => row.token));
  if (!used.has(base)) return base;
  for (let attempt = 2; attempt <= MAX_SLUG_ATTEMPTS; attempt += 1) {
    const candidate = `${base}-${attempt}`;
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("unreachable");
}

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

export async function duplicateOutputDeep(source: BroadcastOutputRecord): Promise<BroadcastOutputRecord> {
  const newName = `Cópia de ${source.name}`;
  const token = await resolveUniqueToken(newName);

  // Camadas da cena atual da origem + itens da playlist dedicada dela — lidos FORA da transação
  // (só leitura).
  const sourceLayers = source.currentSceneId
    ? await db.select().from(broadcastLayers).where(eq(broadcastLayers.sceneId, source.currentSceneId))
    : [];
  const [sourcePlaylist] = await db
    .select()
    .from(broadcastPlaylists)
    .where(eq(broadcastPlaylists.ownerOutputId, source.id))
    .limit(1);
  const sourceItems = sourcePlaylist
    ? await db
        .select()
        .from(broadcastPlaylistItems)
        .where(eq(broadcastPlaylistItems.playlistId, sourcePlaylist.id))
        .orderBy(asc(broadcastPlaylistItems.order), asc(broadcastPlaylistItems.createdAt), asc(broadcastPlaylistItems.id))
    : [];

  return db.transaction(async (tx) => {
    const [output] = await tx
      .insert(broadcastOutputs)
      .values({
        name: newName,
        token,
        drawerOpen: source.drawerOpen,
        footerOpen: source.footerOpen,
        tickerEnabled: source.tickerEnabled,
        offline: source.offline,
        agendaOpenSeconds: source.agendaOpenSeconds,
        agendaPauseSeconds: source.agendaPauseSeconds,
        // pin fica null (default) — a cópia não herda proteção.
      })
      .returning();

    const [playlist] = await tx
      .insert(broadcastPlaylists)
      .values({ name: `Playlist da ${newName}`, folderPath: sourcePlaylist?.folderPath ?? null, ownerOutputId: output.id })
      .returning();

    if (sourceItems.length > 0) {
      await tx.insert(broadcastPlaylistItems).values(
        sourceItems.map((item) => ({
          playlistId: playlist.id,
          order: item.order,
          title: item.title,
          sourceType: item.sourceType,
          relativePath: item.relativePath,
          mediaAssetId: item.mediaAssetId,
          url: item.url,
          agendaEventId: item.agendaEventId,
          durationSeconds: item.durationSeconds,
          hidden: item.hidden,
          withAudio: item.withAudio,
          visibleFrom: item.visibleFrom,
          visibleUntil: item.visibleUntil,
        })),
      );
    }

    const [scene] = await tx
      .insert(broadcastScenes)
      .values({ key: `output-${output.id}`, name: newName, order: 0 })
      .returning();

    // Espelha as camadas da origem; na camada de vídeo troca o playlistId pra playlist nova.
    type LayerSeed = {
      type: string;
      name: string;
      x: number;
      y: number;
      width: number;
      height: number;
      zIndex: number;
      config: Record<string, unknown>;
      visible: boolean;
    };
    const DEFAULT_LAYER_SEEDS: LayerSeed[] = [
      { type: "video", name: "Playlist principal", x: 0, y: 0, width: 100, height: 100, zIndex: 0, config: {}, visible: true },
      { type: "agenda", name: "Agenda", x: 80, y: 0, width: 20, height: 100, zIndex: 1, config: {}, visible: true },
      { type: "alert", name: "Aviso rápido", x: 0, y: 0, width: 100, height: 100, zIndex: 99, config: {}, visible: true },
    ];
    const seeds: LayerSeed[] =
      sourceLayers.length > 0
        ? sourceLayers.map((layer) => ({
            type: layer.type,
            name: layer.name,
            x: layer.x,
            y: layer.y,
            width: layer.width,
            height: layer.height,
            zIndex: layer.zIndex,
            config: (layer.config ?? {}) as Record<string, unknown>,
            visible: layer.visible,
          }))
        : DEFAULT_LAYER_SEEDS;

    await tx.insert(broadcastLayers).values(
      seeds.map((seed) => ({
        sceneId: scene.id,
        ...seed,
        config: seed.type === "video" ? { ...seed.config, playlistId: playlist.id } : seed.config,
      })),
    );

    const [updated] = await tx
      .update(broadcastOutputs)
      .set({ currentSceneId: scene.id })
      .where(eq(broadcastOutputs.id, output.id))
      .returning();

    return updated as BroadcastOutputRecord;
  });
}
