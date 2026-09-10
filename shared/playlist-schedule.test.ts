import { describe, expect, it } from "vitest";
import {
  isValidScheduleSlot,
  minutesToTimeLabel,
  parseTimeToMinutes,
  resolveScheduledPlaylistId,
  type PlaylistScheduleSlot,
} from "./playlist-schedule";

const TZ = "America/Sao_Paulo";
// 2024-03-13 é uma quarta-feira. 12:00 em São Paulo (UTC-3) = 15:00Z.
const WED_NOON = new Date("2024-03-13T15:00:00Z");
// 2024-03-16 é um sábado. 08:30 em São Paulo = 11:30Z.
const SAT_0830 = new Date("2024-03-16T11:30:00Z");

const WED_BIT = 1 << 3;
const SAT_BIT = 1 << 6;

describe("parseTimeToMinutes", () => {
  it("converte HH:MM", () => {
    expect(parseTimeToMinutes("08:00")).toBe(480);
    expect(parseTimeToMinutes("00:00")).toBe(0);
    expect(parseTimeToMinutes("23:59")).toBe(1439);
  });
  it("rejeita malformado", () => {
    expect(parseTimeToMinutes("8h")).toBeNull();
    expect(parseTimeToMinutes("24:00")).toBeNull();
    expect(parseTimeToMinutes("10:60")).toBeNull();
  });
});

describe("minutesToTimeLabel", () => {
  it("formata com zero à esquerda", () => {
    expect(minutesToTimeLabel(480)).toBe("08:00");
    expect(minutesToTimeLabel(1439)).toBe("23:59");
  });
});

describe("isValidScheduleSlot", () => {
  it("aceita janela válida", () => {
    expect(isValidScheduleSlot({ days: WED_BIT, startMinute: 480, endMinute: 720 })).toBe(true);
  });
  it("rejeita sem dia, janela invertida ou fora de faixa", () => {
    expect(isValidScheduleSlot({ days: 0, startMinute: 480, endMinute: 720 })).toBe(false);
    expect(isValidScheduleSlot({ days: WED_BIT, startMinute: 720, endMinute: 480 })).toBe(false);
    expect(isValidScheduleSlot({ days: WED_BIT, startMinute: 480, endMinute: 480 })).toBe(false);
    expect(isValidScheduleSlot({ days: WED_BIT, startMinute: -1, endMinute: 720 })).toBe(false);
  });
});

describe("resolveScheduledPlaylistId", () => {
  const morning: PlaylistScheduleSlot = { playlistId: "manha", days: WED_BIT | SAT_BIT, startMinute: 6 * 60, endMinute: 12 * 60 };
  const afternoon: PlaylistScheduleSlot = { playlistId: "tarde", days: WED_BIT, startMinute: 12 * 60, endMinute: 18 * 60 };

  it("casa o slot do dia + horário", () => {
    expect(resolveScheduledPlaylistId([morning, afternoon], WED_NOON, TZ)).toBe("tarde");
    expect(resolveScheduledPlaylistId([morning, afternoon], SAT_0830, TZ)).toBe("manha");
  });

  it("null quando nenhum slot casa (dia errado)", () => {
    // sábado à tarde: só 'afternoon' cobriria o horário, mas ele não marca sábado.
    const SAT_1300 = new Date("2024-03-16T16:00:00Z");
    expect(resolveScheduledPlaylistId([morning, afternoon], SAT_1300, TZ)).toBeNull();
  });

  it("null pra lista vazia", () => {
    expect(resolveScheduledPlaylistId([], WED_NOON, TZ)).toBeNull();
  });

  it("fim exclusivo — 12:00 já é 'tarde', não 'manha'", () => {
    const WED_1200_EXACT = new Date("2024-03-13T15:00:00Z");
    expect(resolveScheduledPlaylistId([afternoon, morning], WED_1200_EXACT, TZ)).toBe("tarde");
  });

  it("sobreposição: menor startMinute vence", () => {
    const wide: PlaylistScheduleSlot = { playlistId: "wide", days: WED_BIT, startMinute: 0, endMinute: 24 * 60 };
    expect(resolveScheduledPlaylistId([afternoon, wide], WED_NOON, TZ)).toBe("wide");
  });
});
