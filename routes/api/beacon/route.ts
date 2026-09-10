import { NextResponse } from "next/server";
import { isPluginActive } from "@venore/plugin-sdk";
import { recordOutputBeacon } from "../../../runtime/output-beacon";
import { logPlayback } from "../../../index";

// Telemetria da TV DE VOLTA pro servidor (viewport / navegador / status / uptime / item tocando) —
// POST leve disparado pela view a cada ~30s e nas trocas de status. Sem sessão/RBAC de propósito,
// mesmo racional de output-state / output-events: acesso por token, a TV não faz login. Não vaza
// nada, e a página já passou pelo gate de PIN pra carregar.
//
// Sem `export const runtime` aqui — mesmo motivo de routes/api/upload/route.ts (o dispatcher do
// core carrega o segment config).
function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  return forwardedFor?.split(",")[0]?.trim() || "desconhecido";
}

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  if (!(await isPluginActive("broadcast"))) {
    return NextResponse.json({ error: "O plugin Broadcast Studio está desabilitado." }, { status: 404 });
  }

  const { token } = await params;

  let body: {
    clientId?: unknown;
    viewport?: unknown;
    userAgent?: unknown;
    status?: unknown;
    nowPlaying?: unknown;
    nowPlayingItemId?: unknown;
    nowPlayingLabel?: unknown;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const clientId = typeof body.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: "clientId obrigatório." }, { status: 400 });
  }

  const nowPlaying = typeof body.nowPlaying === "string" ? body.nowPlaying.slice(0, 200) : null;
  const nowPlayingItemId = typeof body.nowPlayingItemId === "string" ? body.nowPlayingItemId.slice(0, 60) : null;
  const nowPlayingLabel = typeof body.nowPlayingLabel === "string" ? body.nowPlayingLabel.slice(0, 200) : null;

  const { startedItemId } = recordOutputBeacon(token, clientId, {
    ip: getClientIp(request),
    viewport: typeof body.viewport === "string" ? body.viewport.slice(0, 20) : "?",
    userAgent: typeof body.userAgent === "string" ? body.userAgent.slice(0, 300) : "",
    status: typeof body.status === "string" ? body.status.slice(0, 20) : "?",
    nowPlaying,
    nowPlayingItemId,
  });

  // Proof-of-play: um item NOVO começou a tocar nesta conexão → registra. Fire-and-forget, não
  // bloqueia o 204 nem falha a requisição se der erro.
  if (startedItemId && nowPlayingLabel) {
    void logPlayback({ token, playlistItemId: startedItemId, itemLabel: nowPlayingLabel }).catch(() => {});
  }

  return new NextResponse(null, { status: 204 });
}
