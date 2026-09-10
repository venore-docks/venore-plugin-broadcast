import { authorizeOutputActor } from "../../../shared/scoped-authorization";
import { setOutputHours } from "./service";
import { validateSetOutputHoursInput } from "./validation";
import type { SetOutputHoursInput, SetOutputHoursResult } from "./types";

export async function setOutputHoursHandler(input: SetOutputHoursInput): Promise<SetOutputHoursResult> {
  const validationError = validateSetOutputHoursInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const authz = await authorizeOutputActor(input.outputId);
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return setOutputHours({ ...input, actorId: authz.actorId });
}
