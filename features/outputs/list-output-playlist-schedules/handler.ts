import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listOutputPlaylistSchedules } from "./service";
import type { ListOutputPlaylistSchedulesResult } from "./types";

// Só broadcast.manage — visão agregada de todas as telas pro loader do admin, mesmo critério de
// list-agenda-outputs.
export async function listOutputPlaylistSchedulesHandler(): Promise<ListOutputPlaylistSchedulesResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return listOutputPlaylistSchedules();
}
