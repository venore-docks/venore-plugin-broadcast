import type { OperationResult } from "@venore/plugin-sdk";

// Manda a(s) TV(s) conectada(s) a esta tela recarregarem a página — publica um evento SSE
// "reload" no token da saída (ver runtime/output-bus + BroadcastOutputEvent). Não toca no banco.
export type ReloadOutputCommand = { outputId: string; actorId: string };
export type ReloadOutputInput = Omit<ReloadOutputCommand, "actorId">;
export type ReloadOutputResult = OperationResult<{ outputId: string }>;
