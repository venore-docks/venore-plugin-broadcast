import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

export type SetOutputFrozenCommand = { outputId: string; frozen: boolean; actorId: string };
export type SetOutputFrozenInput = Omit<SetOutputFrozenCommand, "actorId">;
export type SetOutputFrozenResult = OperationResult<BroadcastOutputRecord>;
