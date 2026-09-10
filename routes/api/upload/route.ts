import { NextResponse } from "next/server";
import { isPluginActive } from "@venore/plugin-sdk";
import { uploadLocalVideo } from "../../../index";
import { SAVE_UPLOADED_VIDEO_MESSAGE, removeStoredVideo, saveUploadedVideo } from "../../../runtime/upload-storage";

// Upload de vídeo pra pasta compartilhada (public/broadcast/videos) — o servidor grava no MESMO
// compartilhamento de rede que o operador já usa largando arquivo na mão (decisão explícita); o
// arquivo aparece no próximo "Escanear pasta" de qualquer playlist, idêntico a um largado direto.
//
// Corpo = bytes crus do vídeo (não multipart — request.formData() bufferaria um arquivo de GB
// inteiro em memória). playlistId / filename / title vêm por querystring. O gate de acesso
// (authorizePlaylistActor, dentro de uploadLocalVideo) roda DEPOIS de o arquivo já estar no disco:
// se negar, a rota apaga o arquivo antes de responder.
//
// Sem `export const runtime`/`dynamic` aqui de propósito — Next.js só lê route segment config do
// arquivo de rota real dentro de app/ (o dispatcher genérico do core), não de um re-export; ver o
// mesmo comentário em routes/api/output-events/route.ts. O dispatcher já roda no runtime Node
// (fs/stream disponíveis) e route handlers do App Router não têm teto de corpo embutido.
export async function POST(request: Request): Promise<NextResponse> {
  if (!(await isPluginActive("broadcast"))) {
    return NextResponse.json({ error: "O plugin Broadcast Studio está desabilitado." }, { status: 404 });
  }

  const url = new URL(request.url);
  const playlistId = url.searchParams.get("playlistId")?.trim() ?? "";
  const filename = url.searchParams.get("filename")?.trim() ?? "";
  const title = url.searchParams.get("title")?.trim() || null;

  if (!playlistId || !filename) {
    return NextResponse.json({ error: "Playlist e nome do arquivo são obrigatórios." }, { status: 400 });
  }
  if (!request.body) {
    return NextResponse.json({ error: "Envie o arquivo no corpo da requisição." }, { status: 400 });
  }

  const contentLength = Number(request.headers.get("content-length"));
  const saved = await saveUploadedVideo(
    request.body,
    filename,
    Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null,
  );
  if (!saved.ok) {
    const status = saved.error === "too_large" ? 413 : saved.error === "write_failed" ? 500 : 400;
    return NextResponse.json({ error: SAVE_UPLOADED_VIDEO_MESSAGE[saved.error] }, { status });
  }

  const result = await uploadLocalVideo({ playlistId, relativePath: saved.relativePath, title });
  if (!result.success) {
    // Acesso negado / playlist inválida DEPOIS de gravar — desfaz o arquivo pra não deixar lixo no
    // compartilhamento.
    await removeStoredVideo(saved.relativePath);
    const status = result.error.code.includes("forbidden") ? 403 : 400;
    return NextResponse.json({ error: result.error.message }, { status });
  }

  return NextResponse.json({ item: result.data }, { status: 201 });
}
