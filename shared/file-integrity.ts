import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

// Hash em streaming (não lê o arquivo inteiro em memória) — vídeo pode ter alguns GB, o mesmo
// racional de saveUploadedVideo (runtime/upload-storage.ts) não bufferar upload inteiro. Usado no
// momento de criar um item "local" (add-scanned-playlist-items, upload-local-video) e na
// verificação periódica (features/playlists/verify-local-items-integrity).
export function computeFileSha256(absolutePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(absolutePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
