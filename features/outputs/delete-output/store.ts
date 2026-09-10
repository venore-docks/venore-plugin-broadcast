import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs, broadcastPlaylists, broadcastScenes } from "../../../database/schema";

// A cena de uma saída (key: "output-${outputId}") é dedicada a ela — nada mais a referencia. A FK
// output.currentSceneId é onDelete:"set null" (não cascade), então apagar a saída sozinha deixaria
// a cena/camadas órfãs no banco; por isso apaga as duas em transação: a saída primeiro (nada
// referencia outputs.id... exceto playlists.owner_output_id, abaixo), depois a cena por id
// (camadas somem em cascata, FK onDelete: "cascade" no schema).
//
// Playlist dedicada (owner_output_id = id da saída, modelo 1:1 — ver create-output/store.ts):
// resolve o id ANTES de apagar a saída — a FK playlists.owner_output_id é onDelete:"set null",
// então depois do DELETE da saída a coluna já estaria zerada e não daria mais pra achar a playlist
// por ela. Playlist compartilhada (owner_output_id null, apontada de propósito por setOutputPlaylist)
// NÃO é apagada — pode estar tocando em outra tela.
export async function deleteOutputById(id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [ownedPlaylist] = await tx
      .select({ id: broadcastPlaylists.id })
      .from(broadcastPlaylists)
      .where(eq(broadcastPlaylists.ownerOutputId, id))
      .limit(1);

    const [output] = await tx
      .delete(broadcastOutputs)
      .where(eq(broadcastOutputs.id, id))
      .returning({ currentSceneId: broadcastOutputs.currentSceneId });
    if (!output) return false;

    if (output.currentSceneId) {
      await tx.delete(broadcastScenes).where(eq(broadcastScenes.id, output.currentSceneId));
    }
    if (ownedPlaylist) {
      // playlist_items somem em cascata (FK onDelete: "cascade" no schema).
      await tx.delete(broadcastPlaylists).where(eq(broadcastPlaylists.id, ownedPlaylist.id));
    }
    return true;
  });
}
