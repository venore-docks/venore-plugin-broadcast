import { createWriteStream } from "node:fs";
import { access, mkdir, rename, rm } from "node:fs/promises";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { BROADCAST_ROOT_FOLDER, BROADCAST_VIDEOS_FOLDER_PATH } from "../shared/settings";
import { resolveWithinRoot, toStoredRelativePath } from "../shared/sandboxed-path";
import { streamableContentTypeForExtension } from "../shared/video-extensions";

// I/O plumbing do upload de vídeo — não é uma feature (sem handler/service/authorizeActor), é
// infraestrutura de runtime, mesmo espírito de runtime/video-stream.ts. O acesso (authorizeActor)
// e a criação do item de playlist ficam em features/playlists/upload-local-video, que roda DEPOIS
// disto: o arquivo já está no disco quando o handler valida — se ele negar, a rota chama
// removeStoredVideo pra desfazer.
//
// Grava no MESMO compartilhamento de rede que o operador já usa largando arquivo na mão (decisão
// explícita: "a pasta que usamos hoje... também é acessada via rede"). O servidor só faz a cópia
// pela própria montagem; o resultado é indistinguível de um arquivo largado direto, e o próximo
// "Escanear pasta" de qualquer playlist enxerga.

// Teto de tamanho de um upload. 4 GB cobre um institucional longo em 1080p com folga; acima disso
// o caminho continua sendo largar direto no compartilhamento.
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024 * 1024;

export type SaveUploadedVideoError = "invalid_filename" | "too_large" | "path_escape" | "write_failed";

export const SAVE_UPLOADED_VIDEO_MESSAGE: Record<SaveUploadedVideoError, string> = {
  invalid_filename: "Nome de arquivo inválido — use um arquivo .mp4 ou .webm.",
  too_large: "Arquivo maior que o limite de 4 GB — largue-o direto na pasta de vídeos pela rede.",
  path_escape: "Não foi possível resolver a pasta de vídeos.",
  write_failed:
    "Não foi possível gravar na pasta de vídeos — confira se o compartilhamento de rede está acessível e com permissão de escrita.",
};

export type SaveUploadedVideoResult =
  | { ok: true; relativePath: string; bytes: number }
  | { ok: false; error: SaveUploadedVideoError };

// Fica só o basename, sem separador nem "..", sem caractere de controle, e o resultado precisa
// manter uma extensão de vídeo suportada. O nome continua legível de propósito — quem usa o
// compartilhamento pela rede vê o mesmo arquivo.
export function sanitizeUploadFilename(raw: string): string | null {
  const printable = Array.from(raw.trim())
    .filter((ch) => {
      const code = ch.charCodeAt(0);
      return code >= 0x20 && code !== 0x7f;
    })
    .join("");
  const base = path.basename(printable).replace(/\.\.+/g, ".").replace(/[/\\]/g, "").trim();
  if (!base || base === "." || base.startsWith(".")) return null;
  const contentType = streamableContentTypeForExtension(path.extname(base));
  if (!contentType || !contentType.startsWith("video/")) return null;
  return base;
}

// Acha um nome livre na pasta — "clipe.mp4" já existe -> "clipe (2).mp4", "(3)"... (a rota manual
// de largar na pasta também não faz check de colisão, então sufixar é mais amigável que rejeitar).
async function resolveFreeName(dir: string, name: string): Promise<string> {
  const ext = path.extname(name);
  const stem = name.slice(0, name.length - ext.length);
  let candidate = name;
  for (let n = 2; n <= 999; n += 1) {
    try {
      await access(path.join(dir, candidate));
      candidate = `${stem} (${n})${ext}`;
    } catch {
      return candidate;
    }
  }
  return `${stem} (${crypto.randomUUID().slice(0, 8)})${ext}`;
}

export async function saveUploadedVideo(
  body: ReadableStream<Uint8Array>,
  rawFilename: string,
  declaredContentLength: number | null,
): Promise<SaveUploadedVideoResult> {
  const safeName = sanitizeUploadFilename(rawFilename);
  if (!safeName) return { ok: false, error: "invalid_filename" };

  if (declaredContentLength != null && declaredContentLength > MAX_UPLOAD_BYTES) {
    return { ok: false, error: "too_large" };
  }

  const videosDir = resolveWithinRoot(BROADCAST_ROOT_FOLDER, BROADCAST_VIDEOS_FOLDER_PATH);
  if (!videosDir) return { ok: false, error: "path_escape" };

  try {
    await mkdir(videosDir, { recursive: true });
  } catch {
    return { ok: false, error: "write_failed" };
  }

  const finalName = await resolveFreeName(videosDir, safeName);
  // Defesa em profundidade — resolveFreeName só mexe no basename, mas reconfere que o alvo continua
  // dentro da raiz (mesmo espírito de resolve-streamable-playlist-item).
  const finalPath = resolveWithinRoot(BROADCAST_ROOT_FOLDER, path.posix.join(BROADCAST_VIDEOS_FOLDER_PATH, finalName));
  if (!finalPath) return { ok: false, error: "path_escape" };

  const tempPath = path.join(videosDir, `.upload-${crypto.randomUUID()}.part`);

  let bytes = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _enc, callback) {
      bytes += chunk.length;
      if (bytes > MAX_UPLOAD_BYTES) {
        callback(new Error("too_large"));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    // Escreve num ".part" e renomeia no fim — o scan/stream nunca veem um arquivo pela metade.
    await pipeline(
      Readable.fromWeb(body as import("node:stream/web").ReadableStream),
      counter,
      createWriteStream(tempPath),
    );
    await rename(tempPath, finalPath);
  } catch (error) {
    await rm(tempPath, { force: true }).catch(() => {});
    return { ok: false, error: (error as Error).message === "too_large" ? "too_large" : "write_failed" };
  }

  return { ok: true, relativePath: toStoredRelativePath(BROADCAST_ROOT_FOLDER, finalPath), bytes };
}

// Desfaz um arquivo já gravado quando o handler de acesso nega DEPOIS da gravação.
export async function removeStoredVideo(relativePath: string): Promise<void> {
  const absolutePath = resolveWithinRoot(BROADCAST_ROOT_FOLDER, relativePath);
  if (!absolutePath) return;
  await rm(absolutePath, { force: true }).catch(() => {});
}
