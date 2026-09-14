import { isValidScheduleSlot } from "../../../shared/playlist-schedule";
import type { CreateScheduledAlertInput } from "./types";

export function validateCreateScheduledAlertInput(input: CreateScheduledAlertInput): { code: string; message: string } | null {
  if (!input.message || !input.message.trim()) {
    return { code: "broadcast.create-scheduled-alert.invalid_message", message: "Escreva a mensagem do aviso." };
  }
  if (!isValidScheduleSlot({ days: input.activeDays, startMinute: input.activeStartMinute, endMinute: input.activeEndMinute })) {
    return {
      code: "broadcast.create-scheduled-alert.invalid_schedule",
      message: "Escolha pelo menos um dia e um horário de início antes do fim.",
    };
  }
  return null;
}
