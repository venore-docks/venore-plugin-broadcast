import Papa from "papaparse";
import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { parseWallTimeInZone } from "../../../shared/timezone";
import { agendaExists, bulkInsertAgendaEvents } from "./store";
import type { ImportAgendaCsvCommand, ImportAgendaCsvResult } from "./types";

const MAX_ROWS = 1000;

// Aceita "YYYY-MM-DD HH:MM" e "YYYY-MM-DDTHH:MM" (o parseWallTimeInZone quer o "T").
function parseCell(value: string, timeZone: string): Date | null {
  const normalized = value.trim().replace(" ", "T");
  if (!normalized) return null;
  const date = parseWallTimeInZone(normalized, timeZone);
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function pick(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const found = Object.keys(row).find((k) => k.trim().toLowerCase() === key);
    if (found && row[found]?.trim()) return row[found].trim();
  }
  return "";
}

export async function importAgendaCsv(command: ImportAgendaCsvCommand): Promise<ImportAgendaCsvResult> {
  if (!(await agendaExists(command.agendaId))) {
    return { success: false, error: { code: "broadcast.import-agenda-csv.agenda_not_found", message: "Agenda não encontrada." } };
  }

  const parsed = Papa.parse<Record<string, string>>(command.csv.trim(), {
    header: true,
    skipEmptyLines: true,
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0 && parsed.data.length === 0) {
    return { success: false, error: { code: "broadcast.import-agenda-csv.parse_failed", message: "Não foi possível ler o CSV." } };
  }
  if (parsed.data.length > MAX_ROWS) {
    return {
      success: false,
      error: { code: "broadcast.import-agenda-csv.too_many_rows", message: `Máximo de ${MAX_ROWS} linhas por importação.` },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.import-agenda-csv",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const valid: { title: string; startAt: Date; endAt: Date | null; location: string | null; description: string | null }[] = [];
  const errors: string[] = [];

  parsed.data.forEach((row, i) => {
    const line = i + 2; // +1 cabeçalho, +1 base-1
    const title = pick(row, "titulo", "título", "title", "nome");
    const startRaw = pick(row, "inicio", "início", "start", "data");
    if (!title) {
      errors.push(`Linha ${line}: sem título.`);
      return;
    }
    const startAt = parseCell(startRaw, command.timeZone);
    if (!startAt) {
      errors.push(`Linha ${line}: início inválido ("${startRaw}"). Use "AAAA-MM-DD HH:MM".`);
      return;
    }
    const endRaw = pick(row, "fim", "termino", "término", "end");
    const endAt = endRaw ? parseCell(endRaw, command.timeZone) : null;
    if (endRaw && !endAt) {
      errors.push(`Linha ${line}: fim inválido ("${endRaw}").`);
      return;
    }
    if (endAt && endAt.getTime() <= startAt.getTime()) {
      errors.push(`Linha ${line}: o fim precisa ser depois do início.`);
      return;
    }
    valid.push({
      title: title.slice(0, 200),
      startAt,
      endAt,
      location: pick(row, "local", "sala", "location") || null,
      description: pick(row, "descricao", "descrição", "description", "obs") || null,
    });
  });

  const created = await bulkInsertAgendaEvents(command.agendaId, valid);

  endOperation(handle, { success: true });
  return { success: true, data: { created, skipped: errors.length, errors: errors.slice(0, 20) } };
}
