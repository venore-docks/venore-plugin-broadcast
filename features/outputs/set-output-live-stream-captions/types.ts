import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

export type SetOutputLiveStreamCaptionsCommand = { outputId: string; captions: boolean; actorId: string };
export type SetOutputLiveStreamCaptionsInput = Omit<SetOutputLiveStreamCaptionsCommand, "actorId">;
export type SetOutputLiveStreamCaptionsResult = OperationResult<BroadcastOutputRecord>;
