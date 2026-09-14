import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastAlertTarget, BroadcastScheduledAlertRecord } from "../../../contracts/types";

export type CreateScheduledAlertCommand = {
  message: string;
  target: BroadcastAlertTarget;
  activeDays: number;
  activeStartMinute: number;
  activeEndMinute: number;
  actorId: string;
};
export type CreateScheduledAlertInput = Omit<CreateScheduledAlertCommand, "actorId">;
export type CreateScheduledAlertResult = OperationResult<BroadcastScheduledAlertRecord>;
