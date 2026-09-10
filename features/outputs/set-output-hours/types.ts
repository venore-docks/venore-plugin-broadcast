import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// Horário de funcionamento da tela. Os três null = sem horário (sempre no ar). Os três
// preenchidos = janela ativa; fora dela a tela entra em modo espera automático. days: bitmask
// (bit 0 = domingo), start/end em minutos desde a meia-noite, fim exclusivo, sem cruzar 0h.
export type SetOutputHoursCommand = {
  outputId: string;
  days: number | null;
  startMinute: number | null;
  endMinute: number | null;
  actorId: string;
};
export type SetOutputHoursInput = Omit<SetOutputHoursCommand, "actorId">;
export type SetOutputHoursResult = OperationResult<BroadcastOutputRecord>;
