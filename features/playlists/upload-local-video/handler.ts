import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { runGatedMutation, type GatedMutationResult } from "../../content-changes/shared/gate";
import { CONTENT_CHANGE_USE_CASES } from "../../content-changes/shared/use-cases";
import type { BroadcastPlaylistItemRecord } from "../../../contracts/types";
import { uploadLocalVideo } from "./service";
import type { UploadLocalVideoInput } from "./types";

// Gate por recurso — broadcast.manage OU (broadcast.playlists.manage + atribuição a ESTA playlist).
// Gateado pelo fluxo de aprovação (v1.9.2) — faltava aqui: um operador escopado podia contornar a
// aprovação de add-scanned-playlist-items simplesmente subindo o vídeo em vez de escanear a pasta,
// os dois criam item de playlist da mesma forma (sourceType "local"). O arquivo já está gravado no
// disco quando isto roda (rota routes/api/upload/route.ts) MESMO se ficar pending — só o registro
// como item de playlist é que fica pendente, o arquivo em si não aparece em nenhuma TV até isso
// acontecer (mesmo racional de "escanear só lista candidatos, adicionar é que publica").
export async function uploadLocalVideoHandler(
  input: UploadLocalVideoInput,
): Promise<GatedMutationResult<BroadcastPlaylistItemRecord>> {
  if (!input.playlistId || !input.relativePath) {
    return {
      success: false,
      pending: false,
      error: { code: "broadcast.upload-local-video.invalid_input", message: "Playlist e arquivo são obrigatórios." },
    };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, pending: false, error: authz.error };
  }

  return runGatedMutation({
    useCase: CONTENT_CHANGE_USE_CASES.uploadLocalVideo,
    entityType: "playlist_item",
    isFullAccess: authz.isFullAccess,
    actorId: authz.actorId,
    targetId: null,
    playlistId: input.playlistId,
    payload: { ...input },
    apply: (payload) => uploadLocalVideo({ ...(payload as UploadLocalVideoInput), actorId: authz.actorId }),
  });
}
