import type { OperationResult } from "@venore/plugin-sdk";

export type DeleteScheduledAlertInput = { id: string };
export type DeleteScheduledAlertResult = OperationResult<{ id: string }>;
