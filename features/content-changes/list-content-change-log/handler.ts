import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listContentChangeLog } from "../shared/store";
import type { ListContentChangeLogResult } from "./types";

// Log de auditoria completo (todo status) — só broadcast.manage, mesmo racional da fila.
export async function listContentChangeLogHandler(): Promise<ListContentChangeLogResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return { success: true, data: await listContentChangeLog() };
}
