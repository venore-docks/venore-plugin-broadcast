import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastLiveStreamSummary } from "../../../contracts/types";

export type ListLiveStreamsResult = OperationResult<BroadcastLiveStreamSummary[]>;
