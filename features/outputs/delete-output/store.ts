import { and, eq, ne, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastLayers, broadcastOutputs, broadcastPlaylists, broadcastScenes } from "../../../database/schema";

// A cena de uma saída (key: "output-${outputId}") é dedicada a ela — nada mais a referencia. A FK
// output.currentSceneId é onDelete:"set null" (não cascade), então apagar a saída sozinha deixaria
// a cena/camadas órfãs no banco; por isso apaga as duas em transação: a saída primeiro (nada
// referencia outputs.id... exceto playlists.owner_output_id, abaixo), depois a cena por id
// (camadas somem em cascata, FK onDelete: "cascade" no schema).
//
// Playlist dedicada (owner_output_id = id da saída, modelo 1:1 — ver create-output/store.ts):
// resolve o id ANTES de apagar a saída — a FK playlists.owner_output_id é onDelete:"set null",
// então depois do DELETE da saída a coluna já estaria zerada e não daria mais pra achar a playlist
// por ela.
//
// v1.7: outra tela pode estar tocando a playlist DESTA tela ("recepção e catracas mostram o
// mesmo" — ver outputs-section.tsx). Nesse caso a playlist NÃO é apagada: a posse passa pra uma
// dessas outras telas (a primeira que a toca) e os itens continuam intactos. Só apaga a playlist
// dedicada quando ninguém mais a usa. Playlist compartilhada sem dono (owner_output_id null) nunca
// é tocada por esta rota.
export async function deleteOutputById(id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [ownedPlaylist] = await tx
      .select({ id: broadcastPlaylists.id })
      .from(broadcastPlaylists)
      .where(eq(broadcastPlaylists.ownerOutputId, id))
      .limit(1);

    // Outras telas que tocam a playlist dedicada desta tela — a playlist que uma tela toca mora na
    // config da camada "video" da cena dela (ver resolve-output-playlist-ids.ts).
    const otherOutputsUsingOwned = ownedPlaylist
      ? await tx
          .select({ id: broadcastOutputs.id })
          .from(broadcastOutputs)
          .innerJoin(
            broadcastLayers,
            and(eq(broadcastLayers.sceneId, broadcastOutputs.currentSceneId), eq(broadcastLayers.type, "video")),
          )
          .where(
            and(
              ne(broadcastOutputs.id, id),
              eq(sql`${broadcastLayers.config} ->> 'playlistId'`, ownedPlaylist.id),
            ),
          )
      : [];

    const [output] = await tx
      .delete(broadcastOutputs)
      .where(eq(broadcastOutputs.id, id))
      .returning({ currentSceneId: broadcastOutputs.currentSceneId });
    if (!output) return false;

    if (output.currentSceneId) {
      await tx.delete(broadcastScenes).where(eq(broadcastScenes.id, output.currentSceneId));
    }
    if (ownedPlaylist) {
      if (otherOutputsUsingOwned.length > 0) {
        // Transfere a posse pra outra tela que a usa — mantém os itens, a playlist passa a ser
        // editável a partir do detalhe dessa tela.
        await tx
          .update(broadcastPlaylists)
          .set({ ownerOutputId: otherOutputsUsingOwned[0].id, updatedAt: new Date() })
          .where(eq(broadcastPlaylists.id, ownedPlaylist.id));
      } else {
        // playlist_items somem em cascata (FK onDelete: "cascade" no schema).
        await tx.delete(broadcastPlaylists).where(eq(broadcastPlaylists.id, ownedPlaylist.id));
      }
    }
    return true;
  });
}
