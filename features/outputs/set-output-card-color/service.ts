import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { applyOutputCardColor, findOutputById } from "./store";
import type { SetOutputCardColorCommand, SetOutputCardColorResult } from "./types";

// Aceita só um hex curto (#rgb / #rrggbb); qualquer outra coisa vira null (sem cor).
const HEX_COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export async function setOutputCardColor(command: SetOutputCardColorCommand): Promise<SetOutputCardColorResult> {
  const output = await findOutputById(command.outputId);
  if (!output) {
    return { success: false, error: { code: "broadcast.set-output-card-color.not_found", message: "Tela não encontrada." } };
  }

  const raw = command.cardColor?.trim() ?? "";
  const normalized = HEX_COLOR.test(raw) ? raw.toLowerCase() : null;

  const handle = beginOperation({
    useCase: "broadcast.set-output-card-color",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await applyOutputCardColor(command.outputId, normalized);

  endOperation(handle, { success: true });
  return { success: true, data: record };
}
