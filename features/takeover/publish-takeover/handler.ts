import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { publishTakeover } from "./service";
import { validatePublishTakeoverInput } from "./validation";
import type { PublishTakeoverInput, PublishTakeoverResult } from "./types";

export async function publishTakeoverHandler(input: PublishTakeoverInput): Promise<PublishTakeoverResult> {
  const validationError = validatePublishTakeoverInput(input);
  if (validationError) {
    return { success: false, error: validationError };
  }

  const authz = await authorizeActor("broadcast.manage");
  if (!authz.authorized) {
    return { success: false, error: authz.error };
  }

  return publishTakeover({ ...input, actorId: authz.actorId });
}
