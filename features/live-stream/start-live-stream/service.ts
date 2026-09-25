import { beginOperation, endOperation } from "@venore/plugin-sdk/observability";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { parseYouTubeLink } from "../../../shared/youtube";
import { probeYouTubeVideo } from "./probe";
import { createLiveStreamOnOutputs, findOutputsByIds } from "./store";
import type { StartLiveStreamCommand, StartLiveStreamResult } from "./types";

export async function startLiveStream(command: StartLiveStreamCommand): Promise<StartLiveStreamResult> {
  const parsed = parseYouTubeLink(command.url);
  if (parsed.kind !== "video") {
    return {
      success: false,
      error: { code: "broadcast.start-live-stream.invalid_url", message: "Cole um link de vídeo ou transmissão do YouTube." },
    };
  }

  const outputIds = [...new Set(command.outputIds.filter(Boolean))];
  const outputs = await findOutputsByIds(outputIds);
  if (outputs.length !== outputIds.length) {
    return {
      success: false,
      error: { code: "broadcast.start-live-stream.output_not_found", message: "Uma das telas escolhidas não existe mais." },
    };
  }

  const probe = await probeYouTubeVideo(parsed.videoId);
  if (probe.status === "not-embeddable") {
    return {
      success: false,
      error: {
        code: "broadcast.start-live-stream.not_embeddable",
        message: "O dono dessa transmissão não permite exibi-la fora do YouTube — ela não abriria nas telas.",
      },
    };
  }
  if (probe.status === "not-found") {
    return {
      success: false,
      error: {
        code: "broadcast.start-live-stream.not_found",
        message: "O YouTube não encontrou essa transmissão (link errado, privada ou removida).",
      },
    };
  }

  const handle = beginOperation({
    useCase: "broadcast.start-live-stream",
    actor: { id: command.actorId, type: "user" },
    kind: "write",
  });

  const record = await createLiveStreamOnOutputs(
    { videoId: parsed.videoId, sourceUrl: command.url.trim(), title: probe.status === "ok" ? probe.title : null },
    outputIds,
  );

  endOperation(handle, { success: true });

  // Só as telas afetadas — diferente de alerta/takeover, a transmissão é por tela, não global.
  for (const output of outputs) publishOutputEvent(output.token, { type: "live-stream-changed" });

  return { success: true, data: record };
}
