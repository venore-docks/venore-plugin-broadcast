import { authorizeAgendaActor } from "../../../shared/scoped-authorization";
import { importAgendaCsv } from "./service";
import type { ImportAgendaCsvInput, ImportAgendaCsvResult } from "./types";

// Mesmo gate de criar evento — broadcast.manage OU broadcast.agenda.manage + atribuição a esta
// agenda.
export async function importAgendaCsvHandler(input: ImportAgendaCsvInput): Promise<ImportAgendaCsvResult> {
  if (!input.agendaId || !input.csv?.trim()) {
    return { success: false, error: { code: "broadcast.import-agenda-csv.invalid_input", message: "Agenda e CSV são obrigatórios." } };
  }

  const authz = await authorizeAgendaActor(input.agendaId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return importAgendaCsv({ ...input, actorId: authz.actorId });
}
