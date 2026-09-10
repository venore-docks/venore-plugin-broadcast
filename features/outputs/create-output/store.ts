import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastLayers, broadcastOutputs, broadcastPlaylists, broadcastScenes } from "../../../database/schema";
import { BROADCAST_VIDEOS_FOLDER_PATH } from "../../../shared/settings";
import { slugifyOutputName } from "../../../shared/output-token";
import type { BroadcastOutputRecord } from "../../../contracts/types";

const MAX_SLUG_ATTEMPTS = 50;

// Resolve um token livre ANTES de inserir, em vez de inserir-e-tentar-de-novo-no-catch: dentro de
// uma transação, uma violação de unique constraint aborta a transação inteira no Postgres — um
// INSERT seguinte (mesmo com um token diferente) falharia igual, não por outro conflito, mas
// porque a transação já está em estado abortado. Checar antes evita esse problema (troca uma
// janela de corrida rara — dois operadores criando saídas com o mesmo nome no mesmíssimo
// instante — por uma implementação simples; aceitável pra uma ferramenta de admin de baixo
// tráfego).
async function resolveUniqueToken(name: string): Promise<string> {
  const base = slugifyOutputName(name);
  const existing = await db.select({ token: broadcastOutputs.token }).from(broadcastOutputs);
  const usedTokens = new Set(existing.map((row) => row.token));
  if (!usedTokens.has(base)) return base;

  for (let attempt = 2; attempt <= MAX_SLUG_ATTEMPTS; attempt++) {
    const candidate = `${base}-${attempt}`;
    if (!usedTokens.has(candidate)) return candidate;
  }
  throw new Error("unreachable");
}

// Cria a saída já com sua "cena padrão" pronta pra tocar: vídeo + agenda + aviso rápido, no
// layout fixo de 3 zonas que todo o resto do plugin já assume (MainZoneLayer/AgendaLayer/
// AlertBanner) — pedido explícito: "não vamos precisar configurar manualmente as camadas".
//
// A partir do modelo 1:1 (pedido explícito: "criar playlist dedicada por tela"), a tela também
// nasce com a PRÓPRIA playlist ("Playlist da <tela>", owner_output_id = id da tela) — o operador
// não escolhe mais uma playlist na criação. Apontar a tela pra uma playlist compartilhada
// continua possível depois, via setOutputPlaylist (caminho "avançado"). A playlist dedicada aponta
// pra mesma pasta compartilhada de vídeos (BROADCAST_VIDEOS_FOLDER_PATH) — o "Escanear pasta"
// decide o subconjunto, igual a qualquer outra playlist local.
//
// A camada de vídeo nasce em 100% de largura (config.agendaOpenVariant encolhe pra 80% quando
// drawerOpen=true, mesmo mecanismo de resolveLayerGeometry); a de agenda nasce nos 20% restantes,
// mas só é renderizada quando drawerOpen=true (ver LayerRenderer).
export async function createOutputWithDefaultScene(input: { name: string }): Promise<BroadcastOutputRecord> {
  const token = await resolveUniqueToken(input.name);

  return db.transaction(async (tx) => {
    const [output] = await tx.insert(broadcastOutputs).values({ name: input.name, token }).returning();

    const [playlist] = await tx
      .insert(broadcastPlaylists)
      .values({ name: `Playlist da ${input.name}`, folderPath: BROADCAST_VIDEOS_FOLDER_PATH, ownerOutputId: output.id })
      .returning();

    const [scene] = await tx
      .insert(broadcastScenes)
      .values({ key: `output-${output.id}`, name: input.name, order: 0 })
      .returning();

    await tx.insert(broadcastLayers).values([
      {
        sceneId: scene.id,
        type: "video",
        name: "Playlist principal",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 0,
        config: { playlistId: playlist.id, agendaOpenVariant: { x: 0, y: 0, width: 80, height: 100 } },
        visible: true,
      },
      {
        sceneId: scene.id,
        type: "agenda",
        name: "Agenda",
        x: 80,
        y: 0,
        width: 20,
        height: 100,
        zIndex: 1,
        config: {},
        visible: true,
      },
      {
        sceneId: scene.id,
        type: "alert",
        name: "Aviso rápido",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        zIndex: 99,
        config: {},
        visible: true,
      },
    ]);

    const [updatedOutput] = await tx
      .update(broadcastOutputs)
      .set({ currentSceneId: scene.id, drawerOpen: true })
      .where(eq(broadcastOutputs.id, output.id))
      .returning();

    return updatedOutput as BroadcastOutputRecord;
  });
}
