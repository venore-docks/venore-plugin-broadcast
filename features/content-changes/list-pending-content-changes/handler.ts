import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listPendingContentChanges } from "../shared/store";
import type { ListPendingContentChangesResult } from "./types";

// Fila de aprovação — só broadcast.manage (é quem decide).
export async function listPendingContentChangesHandler(): Promise<ListPendingContentChangesResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return { success: true, data: await listPendingContentChanges() };
}
