import { OUTPUT_TEMPLATES } from "./types";
import type { CreateOutputInput } from "./types";

export function validateCreateOutputInput(input: CreateOutputInput): { code: string; message: string } | null {
  if (!input.name || !input.name.trim()) {
    return { code: "broadcast.create-output.invalid_name", message: "Informe um nome para a saída (ex: \"TV da recepção\")." };
  }
  if (!OUTPUT_TEMPLATES.includes(input.template)) {
    return { code: "broadcast.create-output.invalid_template", message: "Modelo de tela inválido." };
  }
  return null;
}
