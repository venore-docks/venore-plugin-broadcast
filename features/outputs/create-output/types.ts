import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastOutputRecord } from "../../../contracts/types";

// Preset de layout da tela na criação. As 3 camadas fixas (vídeo/agenda/aviso) sempre existem —
// o template só decide a visibilidade inicial da agenda e os toggles de agenda/rodapé. Tudo é
// ajustável depois no card da tela.
//   completo      — vídeo + coluna de agenda aberta + rodapé (o padrão de sempre)
//   video-rodape  — vídeo + rodapé, sem coluna de agenda
//   video         — só o vídeo em tela cheia
export const OUTPUT_TEMPLATES = ["completo", "video-rodape", "video"] as const;
export type OutputTemplate = (typeof OUTPUT_TEMPLATES)[number];

// Sem playlistId: toda tela nasce com a própria playlist dedicada ("Playlist da <tela>", modelo
// 1:1 — ver create-output/store.ts e database/schema/index.ts).
export type CreateOutputCommand = { name: string; template: OutputTemplate; actorId: string };
export type CreateOutputInput = Omit<CreateOutputCommand, "actorId">;
export type CreateOutputResult = OperationResult<BroadcastOutputRecord>;
