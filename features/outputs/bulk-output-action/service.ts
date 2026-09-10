import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { clearGroupForOutputs, findOutputsInGroup, setOfflineForOutputs } from "./store";
import type { BulkOutputActionCommand, BulkOutputActionResult } from "./types";

export async function bulkOutputAction(command: BulkOutputActionCommand): Promise<BulkOutputActionResult> {
  const outputs = await findOutputsInGroup(command.groupName);
  if (outputs.length === 0) {
    return { success: false, error: { code: "broadcast.bulk-output-action.empty_group", message: "Nenhuma tela nesse grupo." } };
  }

  const handle = beginOperation({
    useCase: `broadcast.bulk-output-action.${command.action}`,
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  if (command.action === "reload") {
    for (const output of outputs) publishOutputEvent(output.token, { type: "reload" });
  } else if (command.action === "ungroup") {
    await clearGroupForOutputs(outputs.map((output) => output.id));
  } else {
    const offline = command.action === "offline-on";
    await setOfflineForOutputs(
      outputs.map((output) => output.id),
      offline,
    );
    for (const output of outputs) publishOutputEvent(output.token, { type: "offline-changed", offline });
  }

  endOperation(handle, { success: true });
  return { success: true, data: { affected: outputs.length } };
}
