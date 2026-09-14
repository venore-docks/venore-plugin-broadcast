import { describe, expect, it } from "vitest";
import { validateCreateScheduledAlertInput } from "./validation";

const validInput = { message: "Reunião", target: null, activeDays: 0b0000010, activeStartMinute: 480, activeEndMinute: 540 };

describe("validateCreateScheduledAlertInput", () => {
  it("aceita um input válido", () => {
    expect(validateCreateScheduledAlertInput(validInput)).toBeNull();
  });

  it("recusa mensagem vazia", () => {
    const result = validateCreateScheduledAlertInput({ ...validInput, message: "  " });
    expect(result?.code).toBe("broadcast.create-scheduled-alert.invalid_message");
  });

  it("recusa quando nenhum dia está marcado", () => {
    const result = validateCreateScheduledAlertInput({ ...validInput, activeDays: 0 });
    expect(result?.code).toBe("broadcast.create-scheduled-alert.invalid_schedule");
  });

  it("recusa quando o fim não é depois do início", () => {
    const result = validateCreateScheduledAlertInput({ ...validInput, activeStartMinute: 540, activeEndMinute: 480 });
    expect(result?.code).toBe("broadcast.create-scheduled-alert.invalid_schedule");
  });
});
