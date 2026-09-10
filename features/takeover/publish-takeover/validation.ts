import type { PublishTakeoverInput } from "./types";

export function validatePublishTakeoverInput(input: PublishTakeoverInput): { code: string; message: string } | null {
  if ((!input.message || !input.message.trim()) && !input.mediaAssetId) {
    return { code: "broadcast.publish-takeover.empty", message: "Escreva a mensagem ou escolha uma imagem." };
  }
  if (!(input.durationSeconds > 0)) {
    return { code: "broadcast.publish-takeover.invalid_duration", message: "A duração precisa ser maior que zero." };
  }
  return null;
}
