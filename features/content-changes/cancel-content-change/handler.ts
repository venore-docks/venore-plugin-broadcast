import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { cancelContentChange } from "./service";
import type { CancelContentChangeInput, CancelContentChangeResult } from "./types";

// Mesmo par de permissions de authorizePlaylistActor (broadcast.manage OU broadcast.playlists.
// manage), sem checar atribuição a um recurso específico — quem pode cancelar é decidido pelo
// service (dono da proposta, ou full access), não por qual playlist/tela está em jogo.
export async function cancelContentChangeHandler(input: CancelContentChangeInput): Promise<CancelContentChangeResult> {
  if (!input.changeId) {
    return { success: false, error: { code: "broadcast.cancel-content-change.invalid_change", message: "Alteração inválida." } };
  }

  const full = await authorizeActor("broadcast.manage");
  if (full.authorized) {
    return cancelContentChange({ changeId: input.changeId, actorId: full.actorId, isFullAccess: true });
  }

  const scoped = await authorizeActor("broadcast.playlists.manage");
  if (!scoped.authorized) {
    return { success: false, error: scoped.error };
  }

  return cancelContentChange({ changeId: input.changeId, actorId: scoped.actorId, isFullAccess: false });
}
