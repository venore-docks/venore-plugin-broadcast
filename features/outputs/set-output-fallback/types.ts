import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// Fallback de conteúdo da tela: imagem/vídeo da biblioteca (id) + mensagem livre. undefined =
// não altera esse campo; null = limpa; string = grava. Os dois campos são independentes (um form
// no admin edita a mensagem, outro a mídia, sem clobber).
export type SetOutputFallbackCommand = {
  outputId: string;
  mediaAssetId?: string | null;
  message?: string | null;
  actorId: string;
};
export type SetOutputFallbackInput = Omit<SetOutputFallbackCommand, "actorId">;
export type SetOutputFallbackResult = OperationResult<BroadcastOutputRecord>;
