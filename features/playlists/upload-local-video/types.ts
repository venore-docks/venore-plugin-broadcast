import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";

// O arquivo JÁ está gravado no disco (pela camada de rota — runtime/upload-storage) quando este
// command roda. O handler só valida acesso (authorizePlaylistActor) e cria o item "local"; se
// negar, a rota desfaz o arquivo (removeStoredVideo).
export type UploadLocalVideoCommand = {
  playlistId: string;
  relativePath: string;
  title: string | null;
  actorId: string;
};
export type UploadLocalVideoInput = Omit<UploadLocalVideoCommand, "actorId">;
export type UploadLocalVideoResult = OperationResult<BroadcastPlaylistItemRecord>;
