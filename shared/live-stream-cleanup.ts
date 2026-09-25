import { eq, notExists, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastLiveStreams, broadcastOutputs } from "../database/schema";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Transmissão sem nenhuma tela apontando pra ela não está mais no ar em lugar nenhum — apaga, pra
// que "existe em live_streams" continue significando "está no ar". Compartilhado por start-live-
// stream (uma tela troca de transmissão e deixa a anterior sem tela) e stop-live-stream (tirou a
// última tela) — mora em shared/ porque um store de use case não importa o store de outro
// (AGENTS.md seção 2), mesmo racional de shared/output-tokens.ts.
export async function deleteOrphanLiveStreams(tx: Transaction): Promise<void> {
  await tx
    .delete(broadcastLiveStreams)
    .where(
      notExists(
        tx
          .select({ one: sql`1` })
          .from(broadcastOutputs)
          .where(eq(broadcastOutputs.liveStreamId, broadcastLiveStreams.id)),
      ),
    );
}
