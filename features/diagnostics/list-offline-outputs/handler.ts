import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { listOfflineOutputs } from "./service";
import type { ListOfflineOutputsResult } from "./types";

// Mesmo gate de getOutputDiagnosticsHandler (broadcast.manage OU broadcast.outputs.manage) — ver
// racional lá: quem administra saídas vê o estado de TODAS, não só as suas, mesma folga já aceita
// pra diagnóstico/IPs conectados.
export async function listOfflineOutputsHandler(): Promise<ListOfflineOutputsResult> {
  const fullAccess = await authorizeActor("broadcast.manage");
  if (fullAccess.authorized) return listOfflineOutputs();

  const outputsAccess = await authorizeActor("broadcast.outputs.manage");
  if (!outputsAccess.authorized) {
    return { success: false, error: outputsAccess.error };
  }

  return listOfflineOutputs();
}
