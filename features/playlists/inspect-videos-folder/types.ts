import type { OperationResult } from "@venore/plugin-sdk";

// Saúde da pasta compartilhada de vídeos (public/broadcast/videos) — mostrada como um selo na aba
// Playlists pro operador ver de relance se a pasta existe, quantos vídeos tem e quando mudou.
export type VideosFolderHealth = {
  exists: boolean;
  videoCount: number;
  totalBytes: number;
  // ISO — arquivo mais recente da pasta. null se vazia / não existe.
  lastModifiedAt: string | null;
  // Arquivos que NÃO são vídeo suportado (o scan ignora, mas é útil saber que estão lá).
  otherFileCount: number;
};

export type InspectVideosFolderResult = OperationResult<VideosFolderHealth>;
