import { NextResponse } from "next/server";
import { reportBrowserDiagnostics } from "../../../index";
import { checkRateLimit } from "../../../runtime/rate-limit";
import { isPluginActive } from "@venore/plugin-sdk";
import type { BroadcastBrowserDiagnosticsSnapshot } from "../../../contracts/types";

// 20 por 10s — o reporter manda isto a cada ~20s (DIAGNOSTICS_REPORT_MS em output-canvas.tsx).
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 10_000;

// Chamada pelo reporter em components/output/output-canvas.tsx (fire-and-forget, ver o
// comentário lá) — sem checagem de sessão/PIN de propósito, mesmo racional das outras rotas de
// output/:token: acesso por token, não por login. Sempre responde 200 mesmo em erro de negócio
// (saída não encontrada, snapshot grande demais) — o client descarta a resposta, não há UI de erro
// pra telemetria; só um plugin desabilitado vira 404, igual às outras rotas.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  if (!(await isPluginActive("broadcast"))) {
    return NextResponse.json({ error: "O plugin Broadcast Studio está desabilitado." }, { status: 404 });
  }

  const { token } = await params;

  if (!checkRateLimit(`output-diagnostics-browser:${token}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let snapshot: BroadcastBrowserDiagnosticsSnapshot;
  try {
    snapshot = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  const result = await reportBrowserDiagnostics({ token, snapshot });
  return NextResponse.json({ ok: result.success });
}
