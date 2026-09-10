import type { OperationResult } from "@venore/plugin-sdk";

// Importa eventos de uma planilha (CSV) numa agenda. Colunas esperadas (cabeçalho, ordem livre):
//   titulo        obrigatório
//   inicio        obrigatório — "YYYY-MM-DD HH:MM" (ou com "T"), hora de parede da instituição
//   fim           opcional — mesmo formato
//   local         opcional
//   descricao     opcional
// Eventos avulsos (não recorrentes, sem datas extras) — o caso de recorrência continua no form.
export type ImportAgendaCsvCommand = { agendaId: string; csv: string; timeZone: string; actorId: string };
export type ImportAgendaCsvInput = Omit<ImportAgendaCsvCommand, "actorId">;
export type ImportAgendaCsvResult = OperationResult<{ created: number; skipped: number; errors: string[] }>;
