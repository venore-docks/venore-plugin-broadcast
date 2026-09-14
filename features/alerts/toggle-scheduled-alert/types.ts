import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastScheduledAlertRecord } from "../../../contracts/types";

export type ToggleScheduledAlertInput = { id: string; enabled: boolean };
export type ToggleScheduledAlertResult = OperationResult<BroadcastScheduledAlertRecord>;
