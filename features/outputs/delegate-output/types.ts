import type { OperationResult } from "@venore/plugin-sdk";

// "Delegar a tela inteira" (pedido explícito: atalho + ajuste fino) — atribui/remove uma pessoa
// como responsável da TELA + da(s) playlist(s) que ela toca + da(s) agenda(s) vinculadas a ela,
// numa ação só. O ajuste fino recurso a recurso continua nos set-*-editors.
export type DelegateOutputMode = "grant" | "revoke";

export type DelegateOutputCommand = {
  outputId: string;
  userId: string;
  mode: DelegateOutputMode;
  actorId: string;
};
export type DelegateOutputInput = Omit<DelegateOutputCommand, "actorId">;

export type DelegateOutputResult = OperationResult<{
  outputId: string;
  userId: string;
  mode: DelegateOutputMode;
  // Recursos efetivamente tocados — a UI usa pra confirmar o alcance ("tela + 1 playlist + 2 agendas").
  playlistIds: string[];
  agendaIds: string[];
}>;
