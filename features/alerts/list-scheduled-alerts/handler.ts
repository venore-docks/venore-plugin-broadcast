import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listScheduledAlerts } from "./service";
import type { ListScheduledAlertsResult } from "./types";

export async function listScheduledAlertsHandler(): Promise<ListScheduledAlertsResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return listScheduledAlerts();
}
