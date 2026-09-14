import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listMyContentChanges } from "../shared/store";
import type { ListMyContentChangesResult } from "./types";

// "Minhas alterações" — qualquer ator com pelo menos uma das duas permissions que hoje podem
// gerar uma linha em broadcast_content_changes (broadcast.manage vê as próprias auto_approved
// também, não só operadores escopados vendo suas pendências/decisões).
export async function listMyContentChangesHandler(): Promise<ListMyContentChangesResult> {
  const full = await authorizeActor("broadcast.manage");
  if (full.authorized) {
    return { success: true, data: await listMyContentChanges(full.actorId) };
  }

  const scoped = await authorizeActor("broadcast.playlists.manage");
  if (!scoped.authorized) {
    return { success: false, error: scoped.error };
  }

  return { success: true, data: await listMyContentChanges(scoped.actorId) };
}
