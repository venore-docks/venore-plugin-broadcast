import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastContentChangeRecord } from "../../../contracts/types";

export type ListMyContentChangesResult = OperationResult<BroadcastContentChangeRecord[]>;
