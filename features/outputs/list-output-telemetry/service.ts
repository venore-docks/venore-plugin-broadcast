import { getAllOutputBeacons } from "../../../runtime/output-beacon";
import type { ListOutputTelemetryResult } from "./types";

// Só embrulha a leitura do Map em memória no formato OperationResult — nenhum I/O, nenhuma regra
// de negócio (mesmo espírito de list-connected-output-ips/service.ts). O handler é quem autoriza.
export async function listOutputTelemetry(): Promise<ListOutputTelemetryResult> {
  return { success: true, data: getAllOutputBeacons() };
}
