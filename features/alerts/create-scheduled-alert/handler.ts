import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { createScheduledAlert } from "./service";
import { validateCreateScheduledAlertInput } from "./validation";
import type { CreateScheduledAlertInput, CreateScheduledAlertResult } from "./types";

// Mesmo gate de publish-alert — só broadcast.manage (não existe permission escopada pra alertas
// ainda, ver publish-alert/handler.ts).
export async function createScheduledAlertHandler(input: CreateScheduledAlertInput): Promise<CreateScheduledAlertResult> {
  const validationError = validateCreateScheduledAlertInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return createScheduledAlert({ ...input, actorId: authz.actorId });
}
