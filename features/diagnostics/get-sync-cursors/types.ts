import type { OperationResult } from "@venore/plugin-sdk";

export type SyncCursorSnapshot = Record<string, { itemId: string; itemIndex: number }>;
export type GetSyncCursorsResult = OperationResult<SyncCursorSnapshot>;
