import { gte, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastPlaybackLog } from "../../../database/schema";
import type { PlaybackStat } from "./types";

export async function findPlaybackStats(sinceDays: number): Promise<{ total: number; stats: PlaybackStat[] }> {
  const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);

  const rows = await db
    .select({
      itemLabel: broadcastPlaybackLog.itemLabel,
      plays: sql<number>`count(*)::int`,
      screens: sql<number>`count(distinct ${broadcastPlaybackLog.outputId})::int`,
    })
    .from(broadcastPlaybackLog)
    .where(gte(broadcastPlaybackLog.playedAt, since))
    .groupBy(broadcastPlaybackLog.itemLabel)
    .orderBy(sql`count(*) desc`)
    .limit(30);

  const total = rows.reduce((sum, row) => sum + row.plays, 0);
  return { total, stats: rows.map((row) => ({ itemLabel: row.itemLabel, plays: row.plays, screens: row.screens })) };
}
