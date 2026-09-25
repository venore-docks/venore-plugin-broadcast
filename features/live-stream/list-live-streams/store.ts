import { asc, desc, eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastLiveStreams, broadcastOutputs } from "../../../database/schema";
import type { BroadcastLiveStreamRecord } from "../../../contracts/types";

export async function findLiveStreamsWithOutputs(): Promise<
  { stream: BroadcastLiveStreamRecord; output: { id: string; name: string } }[]
> {
  // inner join: transmissão sem tela não é "no ar" (e é apagada na hora de qualquer forma, ver
  // shared/live-stream-cleanup.ts) — uma linha por par transmissão×tela.
  const rows = await db
    .select({
      stream: broadcastLiveStreams,
      output: { id: broadcastOutputs.id, name: broadcastOutputs.name },
    })
    .from(broadcastLiveStreams)
    .innerJoin(broadcastOutputs, eq(broadcastOutputs.liveStreamId, broadcastLiveStreams.id))
    .orderBy(desc(broadcastLiveStreams.createdAt), asc(broadcastOutputs.name));
  return rows as { stream: BroadcastLiveStreamRecord; output: { id: string; name: string } }[];
}
