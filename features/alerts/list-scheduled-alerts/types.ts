import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastScheduledAlertRecord } from "../../../contracts/types";

export type ListScheduledAlertsResult = OperationResult<BroadcastScheduledAlertRecord[]>;
