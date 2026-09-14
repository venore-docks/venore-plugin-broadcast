import type { OperationResult } from "@venore/plugin-sdk";

export type ApproveContentChangeInput = { changeId: string };
export type ApproveContentChangeCommand = ApproveContentChangeInput & { actorId: string };
export type ApproveContentChangeResult = OperationResult<{ id: string }>;
