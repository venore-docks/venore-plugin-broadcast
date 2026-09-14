import type { OperationResult } from "@venore/plugin-sdk";

export type CancelContentChangeInput = { changeId: string };
export type CancelContentChangeCommand = CancelContentChangeInput & { actorId: string; isFullAccess: boolean };
export type CancelContentChangeResult = OperationResult<{ id: string }>;
