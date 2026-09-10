import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { applyOutputHours, findOutputById } from "./store";
import type { SetOutputHoursCommand, SetOutputHoursResult } from "./types";

export async function setOutputHours(command: SetOutputHoursCommand): Promise<SetOutputHoursResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.set-output-hours.not_found", message: "Tela não encontrada." } };
  }

  const handle = beginOperation({
    useCase: "broadcast.set-output-hours",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyOutputHours(command.outputId, {
    days: command.days,
    startMinute: command.startMinute,
    endMinute: command.endMinute,
  });

  endOperation(handle, { success: true });
  publishOutputEvent(output.token, { type: "settings-changed" });
  return { success: true, data: record };
}
