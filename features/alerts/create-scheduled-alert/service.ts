import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { insertScheduledAlert } from "./store";
import type { CreateScheduledAlertCommand, CreateScheduledAlertResult } from "./types";

export async function createScheduledAlert(command: CreateScheduledAlertCommand): Promise<CreateScheduledAlertResult> {
  const handle = beginOperation({
    useCase: "broadcast.create-scheduled-alert",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await insertScheduledAlert({
    message: command.message.trim(),
    target: command.target ?? null,
    activeDays: command.activeDays,
    activeStartMinute: command.activeStartMinute,
    activeEndMinute: command.activeEndMinute,
  });

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
