import type { OperationResult } from "@venore/plugin-sdk";

// outputId null = encerra a transmissão em todas as telas; preenchido = tira só essa tela dela (as
// outras continuam). Nos dois casos a tela volta pra playlist sozinha.
export type StopLiveStreamCommand = { liveStreamId: string; outputId: string | null; actorId: string };
export type StopLiveStreamInput = Omit<StopLiveStreamCommand, "actorId">;
export type StopLiveStreamResult = OperationResult<{ stopped: number }>;
