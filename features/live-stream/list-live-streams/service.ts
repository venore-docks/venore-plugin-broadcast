import type { BroadcastLiveStreamSummary } from "../../../contracts/types";
import { findLiveStreamsWithOutputs } from "./store";
import type { ListLiveStreamsResult } from "./types";

export async function listLiveStreams(): Promise<ListLiveStreamsResult> {
  const rows = await findLiveStreamsWithOutputs();

  // Agrupa as linhas transmissão×tela por transmissão, preservando a ordem do store (mais recente
  // primeiro, telas em ordem alfabética dentro de cada uma).
  const byId = new Map<string, BroadcastLiveStreamSummary>();
  for (const { stream, output } of rows) {
    const summary = byId.get(stream.id) ?? { ...stream, outputs: [] };
    summary.outputs.push(output);
    byId.set(stream.id, summary);
  }

  return { success: true, data: [...byId.values()] };
}
