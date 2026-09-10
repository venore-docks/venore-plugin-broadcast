import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputPlaylistSchedule } from "./service";
import { validateSetOutputPlaylistScheduleInput } from "./validation";
import type { SetOutputPlaylistScheduleInput, SetOutputPlaylistScheduleResult } from "./types";

// Mesmo gate dos outros controles de UMA tela — broadcast.manage OU broadcast.outputs.manage +
// atribuição a esta tela.
export async function setOutputPlaylistScheduleHandler(
  input: SetOutputPlaylistScheduleInput,
): Promise<SetOutputPlaylistScheduleResult> {
  const validationError = validateSetOutputPlaylistScheduleInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputPlaylistSchedule({ ...input, actorId: authz.actorId });
}
