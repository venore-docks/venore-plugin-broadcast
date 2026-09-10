import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastTakeoverRecord } from "../../../contracts/types";

export type PublishTakeoverCommand = {
  message: string;
  mediaAssetId: string | null;
  durationSeconds: number;
  actorId: string;
};
export type PublishTakeoverInput = Omit<PublishTakeoverCommand, "actorId">;
export type PublishTakeoverResult = OperationResult<BroadcastTakeoverRecord>;
