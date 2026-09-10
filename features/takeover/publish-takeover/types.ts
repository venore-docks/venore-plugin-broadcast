import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastAlertTarget, BroadcastTakeoverRecord } from "../../../contracts/types";

export type PublishTakeoverCommand = {
  message: string;
  mediaAssetId: string | null;
  durationSeconds: number;
  // target: null = todas as telas; "group:<nome>" = um grupo; "output:<id>" = uma tela.
  target: BroadcastAlertTarget;
  actorId: string;
};
export type PublishTakeoverInput = Omit<PublishTakeoverCommand, "actorId">;
export type PublishTakeoverResult = OperationResult<BroadcastTakeoverRecord>;
