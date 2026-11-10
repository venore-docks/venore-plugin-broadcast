import { describe, expect, it } from "vitest";
import { toAgendaRotationEvent, type CalendariosPublicEvent } from "./calendarios-events";

const TZ = "America/Sao_Paulo"; // sem horário de verão: -03:00

const event = (patch: Partial<CalendariosPublicEvent>): CalendariosPublicEvent => ({
  id: "e1",
  title: "Semana Acadêmica",
  detail: "Tema: Fé e ciência",
  location: "Auditório",
  startDate: "2026-09-14",
  endDate: null,
  startTime: null,
  endTime: null,
  ...patch,
});

describe("toAgendaRotationEvent (evento do Calendários → card da agenda)", () => {
  it("evento com horário: a hora de parede vira instante no fuso da instituição", () => {
    const result = toAgendaRotationEvent(event({ startTime: "19:30", endTime: "21:00" }), "ag1", TZ);
    expect(result.startAt.toISOString()).toBe("2026-09-14T22:30:00.000Z");
    expect(result.endAt?.toISOString()).toBe("2026-09-15T00:00:00.000Z");
    expect(result).toMatchObject({ allDay: false, title: "Semana Acadêmica", description: "Tema: Fé e ciência", location: "Auditório", agendaId: "ag1", recurring: false });
  });

  it("dia inteiro: sem horário, allDay, sem término", () => {
    const result = toAgendaRotationEvent(event({}), "ag1", TZ);
    expect(result.allDay).toBe(true);
    expect(result.startAt.toISOString()).toBe("2026-09-14T03:00:00.000Z");
    expect(result.endAt).toBeNull();
  });

  it("vários dias sem horário: termina no fim do último dia", () => {
    const result = toAgendaRotationEvent(event({ endDate: "2026-09-18" }), "ag1", TZ);
    expect(result.allDay).toBe(true);
    expect(result.endAt?.toISOString()).toBe("2026-09-19T02:59:00.000Z");
  });

  it("vários dias com horário: início no 1º dia, término no último", () => {
    const result = toAgendaRotationEvent(event({ endDate: "2026-09-18", startTime: "08:00", endTime: "12:00" }), "ag1", TZ);
    expect(result.startAt.toISOString()).toBe("2026-09-14T11:00:00.000Z");
    expect(result.endAt?.toISOString()).toBe("2026-09-18T15:00:00.000Z");
  });

  it("o id leva prefixo (nunca colide com evento da agenda local) e não há datas extras", () => {
    const result = toAgendaRotationEvent(event({ id: "abc" }), "ag1", TZ);
    expect(result.id).toBe("calendarios:abc");
    expect(result).toMatchObject({ coverMediaAssetId: null, extraDates: [] });
  });

  it("a imagem do evento (capa própria, padrão do setor ou placeholder) vira a capa do card", () => {
    expect(toAgendaRotationEvent(event({ coverPath: "/api/calendarios/eventos/e1/capa" }), "ag1", TZ).coverUrl).toBe("/api/calendarios/eventos/e1/capa");
    expect(toAgendaRotationEvent(event({}), "ag1", TZ).coverUrl).toBeNull();
  });
});
