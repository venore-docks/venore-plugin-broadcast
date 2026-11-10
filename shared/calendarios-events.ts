import type { AgendaRotationEvent } from "../contracts/types";
import { zonedPartsToInstant } from "./timezone";

// Evento público do plugin Calendários (só os campos que o Broadcast consome — o contrato é este tipo
// mínimo, não os tipos internos do outro plugin; dependência OPCIONAL, ver manifest.ts). Datas e
// horas são "de parede" (sem fuso): "YYYY-MM-DD" e "HH:MM".
export type CalendariosPublicEvent = {
  id: string;
  title: string;
  detail: string | null;
  location: string | null;
  startDate: string;
  endDate: string | null;
  startTime: string | null;
  endTime: string | null;
  // Caminho (relativo ao portal) da imagem do evento: capa própria, padrão do setor ou placeholder — o
  // Calendários sempre devolve um. Opcional aqui só para tolerar versão mais antiga do plugin.
  coverPath?: string;
};

function toInstant(date: string, time: string, timeZone: string): Date {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return zonedPartsToInstant({ year: year!, month: month!, day: day!, hour: hour!, minute: minute! }, timeZone);
}

// Evento do Calendários → card da agenda das TVs. A hora de parede é interpretada no fuso da
// instituição (o mesmo que o resto do Broadcast usa). Sem horário = dia inteiro: o card não mostra
// "00:00" (allDay) e o término de vários dias vai até o fim do último dia.
export function toAgendaRotationEvent(event: CalendariosPublicEvent, agendaId: string, timeZone: string, now: Date = new Date()): AgendaRotationEvent {
  const allDay = !event.startTime;
  const startAt = toInstant(event.startDate, event.startTime ?? "00:00", timeZone);
  const lastDay = event.endDate ?? event.startDate;
  let endAt: Date | null = null;
  if (event.endTime) endAt = toInstant(lastDay, event.endTime, timeZone);
  else if (event.endDate) endAt = toInstant(event.endDate, "23:59", timeZone);

  return {
    // Prefixo: o id nunca colide com o de um evento da agenda local.
    id: `calendarios:${event.id}`,
    agendaId,
    title: event.title,
    description: event.detail,
    startAt,
    recurring: false,
    endAt,
    // Sem id de mídia do Broadcast: a imagem é servida pelo próprio Calendários (rota pública).
    coverMediaAssetId: null,
    location: event.location,
    extraDates: [],
    createdAt: now,
    updatedAt: now,
    coverUrl: event.coverPath ?? null,
    allDay,
  };
}
