import { and, eq, isNotNull } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaylistItems, broadcastPlaylists } from "../../../database/schema";

export type LocalItemIntegrityRow = {
  itemId: string;
  playlistId: string;
  playlistName: string;
  title: string | null;
  relativePath: string;
  fileSizeBytes: number;
  fileSha256: string;
};

// Só itens "local" com hash JÁ gravado — itens criados antes desta feature (v1.9.2) não têm
// fileSha256 ainda e ficam de fora até serem re-adicionados/re-aprovados, não entram como "issue"
// por falta de dado histórico.
export async function findLocalItemsWithRecordedIntegrity(): Promise<LocalItemIntegrityRow[]> {
  const rows = await db
    .select({
      itemId: broadcastPlaylistItems.id,
      playlistId: broadcastPlaylistItems.playlistId,
      playlistName: broadcastPlaylists.name,
      title: broadcastPlaylistItems.title,
      relativePath: broadcastPlaylistItems.relativePath,
      fileSizeBytes: broadcastPlaylistItems.fileSizeBytes,
      fileSha256: broadcastPlaylistItems.fileSha256,
    })
    .from(broadcastPlaylistItems)
    .innerJoin(broadcastPlaylists, eq(broadcastPlaylists.id, broadcastPlaylistItems.playlistId))
    .where(and(eq(broadcastPlaylistItems.sourceType, "local"), isNotNull(broadcastPlaylistItems.fileSha256)));
  // relativePath/fileSizeBytes/fileSha256 não-nulos garantidos pela combinação do WHERE
  // (isNotNull fileSha256) + o CHECK de forma da tabela (sourceType "local" sempre tem
  // relativePath) — cast é seguro.
  return rows as LocalItemIntegrityRow[];
}
