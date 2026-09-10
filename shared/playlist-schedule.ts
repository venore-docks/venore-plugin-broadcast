import { getZonedParts } from "./timezone";

// Slot de dayparting já resolvido do banco (ver broadcastOutputPlaylistSchedule em
// database/schema/index.ts). days: bitmask, bit 0 = domingo ... bit 6 = sábado. start/end em
// minutos desde a meia-noite (0–1439), fim EXCLUSIVO, sem cruzar meia-noite.
export type PlaylistScheduleSlot = {
  playlistId: string;
  days: number;
  startMinute: number;
  endMinute: number;
};

export const DAY_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

// true se o slot é válido pra gravar: dia marcado, janela dentro do dia e com duração > 0.
export function isValidScheduleSlot(slot: { days: number; startMinute: number; endMinute: number }): boolean {
  return (
    Number.isInteger(slot.days) &&
    slot.days > 0 &&
    slot.days <= 0b1111111 &&
    Number.isInteger(slot.startMinute) &&
    Number.isInteger(slot.endMinute) &&
    slot.startMinute >= 0 &&
    slot.endMinute <= 1440 &&
    slot.startMinute < slot.endMinute
  );
}

// "HH:MM" (24h) → minutos desde a meia-noite, ou null se malformado.
export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function minutesToTimeLabel(minutes: number): string {
  const clamped = Math.max(0, Math.min(1440, Math.round(minutes)));
  const hours = Math.floor(clamped / 60);
  const mins = clamped % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

// Qual playlist a tela deve tocar AGORA por causa do dayparting — null quando nenhum slot casa (a
// tela cai na playlist padrão da camada de vídeo). Determinístico: entre slots que casam, o de
// MENOR startMinute vence (e, empatando, o primeiro da lista) — dá pro admin resolver sobreposição
// só reordenando/ajustando o horário. `now` é um instante; a hora de parede sai no fuso da
// instituição (getZonedParts, mesma base das datas da agenda).
export function resolveScheduledPlaylistId(
  slots: PlaylistScheduleSlot[],
  now: Date,
  timeZone: string,
): string | null {
  const parts = getZonedParts(now, timeZone);
  const dayBit = 1 << parts.weekday; // getZonedParts.weekday: 0 = domingo
  const minuteOfDay = parts.hour * 60 + parts.minute;

  let best: PlaylistScheduleSlot | null = null;
  for (const slot of slots) {
    if ((slot.days & dayBit) === 0) continue;
    if (minuteOfDay < slot.startMinute || minuteOfDay >= slot.endMinute) continue;
    if (!best || slot.startMinute < best.startMinute) best = slot;
  }
  return best?.playlistId ?? null;
}

// A tela está DENTRO do horário de funcionamento AGORA? Mesma convenção de days/minutos do slot
// de dayparting (bit 0 = domingo, fim exclusivo, sem cruzar meia-noite). Qualquer campo null =
// "sem horário configurado" = sempre ativa (comportamento anterior). Fora da janela, o
// get-output-state força a tela pra modo espera.
export function isWithinActiveHours(
  activeDays: number | null,
  activeStartMinute: number | null,
  activeEndMinute: number | null,
  now: Date,
  timeZone: string,
): boolean {
  if (activeDays == null || activeStartMinute == null || activeEndMinute == null) return true;
  const parts = getZonedParts(now, timeZone);
  if ((activeDays & (1 << parts.weekday)) === 0) return false;
  const minuteOfDay = parts.hour * 60 + parts.minute;
  return minuteOfDay >= activeStartMinute && minuteOfDay < activeEndMinute;
}
