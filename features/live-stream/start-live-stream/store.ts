import { inArray, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastLiveStreams, broadcastOutputs } from "../../../database/schema";
import { deleteOrphanLiveStreams } from "../../../shared/live-stream-cleanup";
import type { BroadcastLiveStreamRecord } from "../../../contracts/types";

export async function findOutputsByIds(ids: string[]): Promise<{ id: string; token: string }[]> {
  if (ids.length === 0) return [];
  return db
    .select({ id: broadcastOutputs.id, token: broadcastOutputs.token })
    .from(broadcastOutputs)
    .where(inArray(broadcastOutputs.id, ids));
}

// Numa transação só: cria a transmissão, aponta as telas pra ela e apaga a transmissão anterior de
// alguma dessas telas se ela ficou sem tela nenhuma.
export async function createLiveStreamOnOutputs(
  input: { videoId: string; sourceUrl: string; title: string | null },
  outputIds: string[],
): Promise<BroadcastLiveStreamRecord> {
  return db.transaction(async (tx) => {
    const [record] = await tx.insert(broadcastLiveStreams).values(input).returning();
    await tx
      .update(broadcastOutputs)
      .set({ liveStreamId: record.id, updatedAt: sql`now()` })
      .where(inArray(broadcastOutputs.id, outputIds));
    await deleteOrphanLiveStreams(tx);
    return record as BroadcastLiveStreamRecord;
  });
}
