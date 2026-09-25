import { parseYouTubeLink } from "../../../shared/youtube";
import type { StartLiveStreamInput } from "./types";

export function validateStartLiveStreamInput(input: StartLiveStreamInput): { code: string; message: string } | null {
  const parsed = parseYouTubeLink(input.url ?? "");
  if (parsed.kind === "channel") {
    return {
      code: "broadcast.start-live-stream.channel_url",
      message:
        "Esse é o link do canal, não da transmissão. Abra a transmissão no YouTube e copie o link dela (youtube.com/watch?v=… ou youtube.com/live/…).",
    };
  }
  if (parsed.kind === "invalid") {
    return { code: "broadcast.start-live-stream.invalid_url", message: "Cole um link de vídeo ou transmissão do YouTube." };
  }
  if (!Array.isArray(input.outputIds) || input.outputIds.filter(Boolean).length === 0) {
    return { code: "broadcast.start-live-stream.no_outputs", message: "Escolha pelo menos uma tela." };
  }
  return null;
}
