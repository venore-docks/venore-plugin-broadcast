import { findPlaybackStats } from "./store";
import type { ListPlaybackStatsQuery, ListPlaybackStatsResult } from "./types";

export async function listPlaybackStats(query: ListPlaybackStatsQuery): Promise<ListPlaybackStatsResult> {
  const sinceDays = query.sinceDays && query.sinceDays > 0 && query.sinceDays <= 90 ? Math.round(query.sinceDays) : 7;
  const { total, stats } = await findPlaybackStats(sinceDays);
  return { success: true, data: { sinceDays, total, stats } };
}
