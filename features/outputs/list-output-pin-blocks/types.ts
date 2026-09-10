import type { OperationResult } from "@venore/plugin-sdk";

// Lista de tokens de saída com pelo menos um bloqueio de tentativa de PIN ativo agora — lido de um
// Map por processo (runtime/pin-attempts), sem I/O. Consumido pelo poll do admin (mesma cadência
// do de IPs conectados).
export type ListOutputPinBlocksResult = OperationResult<string[]>;
