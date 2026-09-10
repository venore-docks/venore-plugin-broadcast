import { and, eq, inArray } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import {
  broadcastAgendaEditors,
  broadcastLayers,
  broadcastOutputAgendas,
  broadcastOutputEditors,
  broadcastOutputs,
  broadcastPlaylistEditors,
  broadcastPlaylists,
} from "../../../database/schema";
import type { BroadcastOutputRecord } from "../../../contracts/types";

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

// Playlists "da tela": a dedicada (owner_output_id = outputId) MAIS a que a camada de vídeo da
// cena atual aponta (pode ser uma compartilhada, se alguém repontou via setOutputPlaylist). União,
// sem duplicata.
export async function findPlaylistIdsForOutput(output: BroadcastOutputRecord): Promise<string[]> {
  const ids = new Set<string>();

  const ownedPlaylists = await db
    .select({ id: broadcastPlaylists.id })
    .from(broadcastPlaylists)
    .where(eq(broadcastPlaylists.ownerOutputId, output.id));
  for (const row of ownedPlaylists) ids.add(row.id);

  if (output.currentSceneId) {
    const layers = await db
      .select({ type: broadcastLayers.type, config: broadcastLayers.config })
      .from(broadcastLayers)
      .where(eq(broadcastLayers.sceneId, output.currentSceneId));
    for (const layer of layers) {
      if (layer.type !== "video") continue;
      const playlistId = (layer.config as Record<string, unknown>).playlistId;
      if (typeof playlistId === "string" && playlistId.length > 0) ids.add(playlistId);
    }
  }

  return [...ids];
}

export async function findAgendaIdsLinkedToOutput(outputId: string): Promise<string[]> {
  const rows = await db
    .select({ agendaId: broadcastOutputAgendas.agendaId })
    .from(broadcastOutputAgendas)
    .where(eq(broadcastOutputAgendas.outputId, outputId));
  return rows.map((row) => row.agendaId);
}

// Grava as três atribuições numa transação. Idempotente — onConflictDoNothing nas PKs compostas
// das tabelas de editores (delegar duas vezes não duplica nem erra).
export async function grantOutputDelegation(
  outputId: string,
  playlistIds: string[],
  agendaIds: string[],
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.insert(broadcastOutputEditors).values({ outputId, userId }).onConflictDoNothing();
    if (playlistIds.length > 0) {
      await tx
        .insert(broadcastPlaylistEditors)
        .values(playlistIds.map((playlistId) => ({ playlistId, userId })))
        .onConflictDoNothing();
    }
    if (agendaIds.length > 0) {
      await tx
        .insert(broadcastAgendaEditors)
        .values(agendaIds.map((agendaId) => ({ agendaId, userId })))
        .onConflictDoNothing();
    }
  });
}

export async function revokeOutputDelegation(
  outputId: string,
  playlistIds: string[],
  agendaIds: string[],
  userId: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(broadcastOutputEditors)
      .where(and(eq(broadcastOutputEditors.outputId, outputId), eq(broadcastOutputEditors.userId, userId)));
    if (playlistIds.length > 0) {
      await tx
        .delete(broadcastPlaylistEditors)
        .where(and(inArray(broadcastPlaylistEditors.playlistId, playlistIds), eq(broadcastPlaylistEditors.userId, userId)));
    }
    if (agendaIds.length > 0) {
      await tx
        .delete(broadcastAgendaEditors)
        .where(and(inArray(broadcastAgendaEditors.agendaId, agendaIds), eq(broadcastAgendaEditors.userId, userId)));
    }
  });
}
