import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastAlertRecord, BroadcastAlertTarget } from "../../../contracts/types";

// target: null = todas as telas; "group:<nome>" = um grupo; "output:<id>" = uma tela.
export type PublishAlertCommand = {
  message: string;
  durationSeconds: number;
  target: BroadcastAlertTarget;
  actorId: string;
};
export type PublishAlertInput = Omit<PublishAlertCommand, "actorId">;
export type PublishAlertResult = OperationResult<BroadcastAlertRecord>;
