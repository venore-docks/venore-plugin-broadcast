import { importActivePluginBarrel } from "@venore/plugin-sdk";
import type { AgendaRotationEvent } from "../contracts/types";
import { toAgendaRotationEvent, type CalendariosPublicEvent } from "../shared/calendarios-events";
import { getZonedParts } from "../shared/timezone";

// Fonte das agendas LIGADAS a um setor do plugin Calendários. Dependência OPCIONAL: o barrel só é
// carregado com o plugin ativo; sem ele (ou se a leitura falhar) a agenda ligada fica vazia e some do
// rodízio — nunca quebra a TV. Só lê (sem rede): quem cadastra os eventos é o setor, no Calendários.
export type CalendariosSector = { id: string; slug: string; name: string };

type CalendariosBarrel = {
  listUpcomingEvents: (input: { sectorSlug?: string; from?: string; limit?: number }) => Promise<
    { success: true; data: CalendariosPublicEvent[] } | { success: false; error: { code: string; message: string } }
  >;
  listEventSectors: () => Promise<{ success: true; data: CalendariosSector[] } | { success: false; error: { code: string; message: string } }>;
};

// "Hoje" no fuso da instituição, como o Calendários espera (YYYY-MM-DD).
function todayIn(timeZone: string): string {
  const { year, month, day } = getZonedParts(new Date(), timeZone);
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export async function resolveCalendariosAgendaEvents(
  sectorSlug: string,
  agendaId: string,
  timeZone: string,
  limit: number,
): Promise<AgendaRotationEvent[]> {
  const calendarios = await importActivePluginBarrel<CalendariosBarrel>("calendarios");
  if (!calendarios) return [];
  const result = await calendarios.listUpcomingEvents({ sectorSlug, from: todayIn(timeZone), limit });
  if (!result.success) return [];
  return result.data.map((event) => toAgendaRotationEvent(event, agendaId, timeZone));
}

// Setores disponíveis para ligar uma agenda (admin). [] quando o Calendários não está instalado/ativo,
// o que esconde o seletor.
export async function listCalendariosSectors(): Promise<CalendariosSector[]> {
  const calendarios = await importActivePluginBarrel<CalendariosBarrel>("calendarios");
  if (!calendarios) return [];
  const result = await calendarios.listEventSectors();
  return result.success ? result.data : [];
}
