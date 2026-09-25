import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";
import { deleteOrphanLiveStreams } from "../../../shared/live-stream-cleanup";

export async function findOutputsOnLiveStream(
  liveStreamId: string,
  outputId: string | null,
): Promise<{ id: string; token: string }[]> {
  const onStream = eq(broadcastOutputs.liveStreamId, liveStreamId);
  return db
    .select({ id: broadcastOutputs.id, token: broadcastOutputs.token })
    .from(broadcastOutputs)
    .where(outputId ? and(onStream, eq(broadcastOutputs.id, outputId)) : onStream);
}

export async function clearLiveStreamFromOutputs(outputIds: string[]): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(broadcastOutputs)
      .set({ liveStreamId: null, updatedAt: sql`now()` })
      .where(inArray(broadcastOutputs.id, outputIds));
    await deleteOrphanLiveStreams(tx);
  });
}
