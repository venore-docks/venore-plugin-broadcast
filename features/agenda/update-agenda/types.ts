import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastAgendaRecord } from "../../../contracts/types";

export type UpdateAgendaCommand = {
  agendaId: string;
  name: string;
  displaySeconds: number;
  backgroundColor?: string | null;
  logoMediaAssetId?: string | null;
  // Slug de um setor do plugin Calendários — a agenda passa a mostrar os eventos dele. Vazio/null = agenda comum.
  calendariosSectorSlug?: string | null;
  actorId: string;
};

export type UpdateAgendaInput = Omit<UpdateAgendaCommand, "actorId">;
export type UpdateAgendaResult = OperationResult<BroadcastAgendaRecord>;
