import { authorizePlaylistActor } from "../../../shared/scoped-authorization";
import { uploadLocalVideo } from "./service";
import type { UploadLocalVideoInput, UploadLocalVideoResult } from "./types";

// Gate por recurso — broadcast.manage OU (broadcast.playlists.manage + atribuição a ESTA playlist).
// Um responsável de playlist pode subir vídeo pra alimentar a playlist dele; o arquivo cai na
// pasta compartilhada e fica disponível pro scan de qualquer playlist, igual a um largado na mão.
export async function uploadLocalVideoHandler(input: UploadLocalVideoInput): Promise<UploadLocalVideoResult> {
  if (!input.playlistId || !input.relativePath) {
    return {
      success: false,
      error: { code: "broadcast.upload-local-video.invalid_input", message: "Playlist e arquivo são obrigatórios." },
    };
  }

  const authz = await authorizePlaylistActor(input.playlistId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return uploadLocalVideo({ ...input, actorId: authz.actorId });
}
