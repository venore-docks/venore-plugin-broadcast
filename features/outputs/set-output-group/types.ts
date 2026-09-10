import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// Define (ou limpa) o rótulo de grupo de uma tela. groupName vazio/null = tira do grupo.
export type SetOutputGroupCommand = { outputId: string; groupName: string | null; actorId: string };
export type SetOutputGroupInput = Omit<SetOutputGroupCommand, "actorId">;
export type SetOutputGroupResult = OperationResult<BroadcastOutputRecord>;
