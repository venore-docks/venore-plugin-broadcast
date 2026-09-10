import type { OperationResult } from "@venore/plugin-sdk";

export type PlaybackStat = { itemLabel: string; plays: number; screens: number };

export type ListPlaybackStatsQuery = { sinceDays?: number };
export type ListPlaybackStatsResult = OperationResult<{ sinceDays: number; total: number; stats: PlaybackStat[] }>;
