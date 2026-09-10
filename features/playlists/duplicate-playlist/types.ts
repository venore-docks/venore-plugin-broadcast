import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastPlaylistRecord } from "../../../contracts/types";

// Duplica uma playlist e todos os seus itens numa playlist NOVA "Cópia de <nome>". A cópia nasce
// sempre COMPARTILHADA (ownerOutputId null), mesmo duplicando uma playlist dedicada a uma tela —
// a cópia não pertence a tela nenhuma até alguém apontar.
export type DuplicatePlaylistCommand = { playlistId: string; actorId: string };
export type DuplicatePlaylistInput = Omit<DuplicatePlaylistCommand, "actorId">;
export type DuplicatePlaylistResult = OperationResult<BroadcastPlaylistRecord>;
