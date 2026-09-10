import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// Define (ou limpa) a cor do card da tela no admin. cardColor vazio/null = sem cor.
export type SetOutputCardColorCommand = { outputId: string; cardColor: string | null; actorId: string };
export type SetOutputCardColorInput = Omit<SetOutputCardColorCommand, "actorId">;
export type SetOutputCardColorResult = OperationResult<BroadcastOutputRecord>;
