import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";

export type UpdatePlaylistItemCommand = {
  itemId: string;
  title?: string | null;
  durationSeconds?: number | null;
  // Só tem efeito em item sourceType "webpage" — ignorado (não sobrescreve) pra local/media-
  // asset/news, cujo url é sempre null por definição (CHECK de forma no schema).
  url?: string | null;
  // Só relevante pra item de vídeo e "webpage" — undefined = não altera.
  withAudio?: boolean;
  // Janela de validade opcional. undefined = não altera; null = limpa a borda (sem limite). O
  // formulário de edição sempre manda os dois (Date ou null); um caller programático pode omitir.
  visibleFrom?: Date | null;
  visibleUntil?: Date | null;
  actorId: string;
};

export type UpdatePlaylistItemInput = Omit<UpdatePlaylistItemCommand, "actorId">;
export type UpdatePlaylistItemResult = OperationResult<BroadcastPlaylistItemRecord>;
