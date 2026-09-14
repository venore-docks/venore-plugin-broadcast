import type { OperationResult } from "@venore/plugin-sdk";

export type RejectContentChangeInput = { changeId: string; reason: string };
export type RejectContentChangeCommand = RejectContentChangeInput & { actorId: string };
export type RejectContentChangeResult = OperationResult<{ id: string }>;
