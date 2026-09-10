import type { OperationResult } from "@venore/plugin-sdk";

// Registra que um item COMEÇOU a tocar numa tela — chamado pela rota do beacon (acesso por token,
// sem sessão), fire-and-forget. playlistItemId pode ser de um item já apagado; itemLabel é o
// snapshot pro relatório.
export type LogPlaybackInput = { token: string; playlistItemId: string; itemLabel: string };
export type LogPlaybackResult = OperationResult<null>;
