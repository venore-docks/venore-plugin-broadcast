import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastLiveStreamRecord } from "../../../contracts/types";

// url: link do YouTube como o admin colou (validado/normalizado em shared/youtube.ts).
// outputIds: telas que passam a mostrar a transmissão no lugar da playlist. Uma tela que já estava
// em outra transmissão troca pra esta.
export type StartLiveStreamCommand = { url: string; outputIds: string[]; actorId: string };
export type StartLiveStreamInput = Omit<StartLiveStreamCommand, "actorId">;
export type StartLiveStreamResult = OperationResult<BroadcastLiveStreamRecord>;
