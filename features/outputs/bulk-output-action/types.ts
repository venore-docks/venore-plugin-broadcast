import type { OperationResult } from "@venore/plugin-sdk";

// Ação em lote sobre todas as telas de um grupo (outputs.group_name).
//   reload      — manda todas recarregarem
//   offline-on  — põe todas em modo espera
//   offline-off — tira todas do modo espera
export type BulkOutputActionKind = "reload" | "offline-on" | "offline-off";

export type BulkOutputActionCommand = { groupName: string; action: BulkOutputActionKind; actorId: string };
export type BulkOutputActionInput = Omit<BulkOutputActionCommand, "actorId">;
export type BulkOutputActionResult = OperationResult<{ affected: number }>;
