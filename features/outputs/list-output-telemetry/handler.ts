import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listOutputTelemetry } from "./service";
import type { ListOutputTelemetryResult } from "./types";

// Só broadcast.manage — mesmo critério de list-connected-output-ips. Chamado pelo poll do admin
// em outputs-section.tsx (junto do de IPs conectados / bloqueios de PIN).
export async function listOutputTelemetryHandler(): Promise<ListOutputTelemetryResult> {
  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return listOutputTelemetry();
}
