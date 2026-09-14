import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { peekAllSyncCursors } from "../../../runtime/sync-cursor";
import type { GetSyncCursorsResult } from "./types";

// Mesmo gate de list-offline-outputs/get-output-diagnostics — broadcast.manage OU
// broadcast.outputs.manage.
export async function getSyncCursorsHandler(): Promise<GetSyncCursorsResult> {
  const fullAccess = await authorizeActor("broadcast.manage");
  if (fullAccess.authorized) return { success: true, data: peekAllSyncCursors() };

  const outputsAccess = await authorizeActor("broadcast.outputs.manage");
  if (!outputsAccess.authorized) {
    return { success: false, error: outputsAccess.error };
  }

  return { success: true, data: peekAllSyncCursors() };
}
