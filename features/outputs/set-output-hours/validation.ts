import { isValidScheduleSlot } from "../../../shared/playlist-schedule";
import type { SetOutputHoursInput } from "./types";

export function validateSetOutputHoursInput(input: SetOutputHoursInput): { code: string; message: string } | null {
  if (!input.outputId) {
    return { code: "broadcast.set-output-hours.invalid_output", message: "Tela inválida." };
  }
  const allNull = input.days == null && input.startMinute == null && input.endMinute == null;
  if (allNull) return null;

  if (input.days == null || input.startMinute == null || input.endMinute == null) {
    return {
      code: "broadcast.set-output-hours.incomplete",
      message: "Pra ligar o horário, preencha os dias e os dois horários — ou deixe tudo em branco pra desligar.",
    };
  }
  if (!isValidScheduleSlot({ days: input.days, startMinute: input.startMinute, endMinute: input.endMinute })) {
    return {
      code: "broadcast.set-output-hours.invalid_window",
      message: "Escolha pelo menos um dia e um horário de fim depois do início (sem cruzar a meia-noite).",
    };
  }
  return null;
}
