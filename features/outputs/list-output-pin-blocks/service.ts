import { listTokensWithActivePinBlock } from "../../../runtime/pin-attempts";
import type { ListOutputPinBlocksResult } from "./types";

// Só embrulha a leitura do Map em memória no formato OperationResult — nenhum I/O, nenhuma regra
// de negócio (mesmo espírito de list-connected-output-ips/service.ts). O handler é quem autoriza.
export async function listOutputPinBlocks(): Promise<ListOutputPinBlocksResult> {
  return { success: true, data: listTokensWithActivePinBlock() };
}
