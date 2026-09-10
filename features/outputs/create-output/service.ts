import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { createOutputWithDefaultScene } from "./store";
import type { CreateOutputCommand, CreateOutputResult } from "./types";

export async function createOutput(command: CreateOutputCommand): Promise<CreateOutputResult> {
  const handle = beginOperation({
    useCase: "broadcast.create-output",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await createOutputWithDefaultScene({ name: command.name.trim() });

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
