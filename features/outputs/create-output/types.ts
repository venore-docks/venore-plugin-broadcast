import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// Sem playlistId: toda tela nasce com a própria playlist dedicada ("Playlist da <tela>", modelo
// 1:1 — ver create-output/store.ts e database/schema/index.ts). Apontar a tela pra uma playlist
// compartilhada existente continua possível depois, via setOutputPlaylist.
export type CreateOutputCommand = { name: string; actorId: string };
export type CreateOutputInput = Omit<CreateOutputCommand, "actorId">;
export type CreateOutputResult = OperationResult<BroadcastOutputRecord>;
