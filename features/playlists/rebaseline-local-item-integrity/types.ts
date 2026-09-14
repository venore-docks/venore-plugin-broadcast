import type { OperationResult } from "@venore/plugin-sdk";

export type RebaselineLocalItemIntegrityInput = { itemId: string };
export type RebaselineLocalItemIntegrityCommand = RebaselineLocalItemIntegrityInput & { actorId: string };
export type RebaselineLocalItemIntegrityResult = OperationResult<{ id: string; fileSizeBytes: number; fileSha256: string }>;
