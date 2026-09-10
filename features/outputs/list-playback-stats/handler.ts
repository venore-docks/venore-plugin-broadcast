import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listPlaybackStats } from "./service";
import type { ListPlaybackStatsQuery, ListPlaybackStatsResult } from "./types";

// Só broadcast.manage — relatório agregado de todas as telas.
export async function listPlaybackStatsHandler(query: ListPlaybackStatsQuery): Promise<ListPlaybackStatsResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return listPlaybackStats(query);
}
