import { NextResponse } from "next/server";
import { reportAgentDiagnostics } from "../../../index";
import { checkRateLimit } from "../../../runtime/rate-limit";
import { isPluginActive } from "@venore/plugin-sdk";
import type { BroadcastAgentDiagnosticsSnapshot } from "../../../contracts/types";

// 20 por 10s — o script PowerShell reporta a cada ~30s. A X-Diagnostics-Key já autentica quem
// manda; o rate limit é defesa em profundidade caso a chave vaze junto.
const RATE_LIMIT = 20;
const RATE_LIMIT_WINDOW_MS = 10_000;

// Chamada pelo script scripts/broadcast-diag-agent.ps1 (PowerShell puro, sem sessão) — a
// autenticação é o header X-Diagnostics-Key contra broadcast.diagnosticsAgentKey, verificado
// dentro do service (comparação em tempo constante). :token na URL é o outputToken (mesma saída
// que a rota output-diagnostics-browser usa) — identifica QUAL tela o PC pertence, a chave só
// prova que quem manda o dado é um agent autorizado.
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  if (!(await isPluginActive("broadcast"))) {
    return NextResponse.json({ error: "O plugin Broadcast Studio está desabilitado." }, { status: 404 });
  }

  const { token } = await params;

  if (!checkRateLimit(`output-diagnostics-agent:${token}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  }

  const agentKey = request.headers.get("x-diagnostics-key") ?? "";

  let body: { stationLabel?: string; snapshot?: BroadcastAgentDiagnosticsSnapshot };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }

  if (!body.snapshot) {
    return NextResponse.json({ error: "Snapshot ausente." }, { status: 400 });
  }

  const result = await reportAgentDiagnostics({
    agentKey,
    outputToken: token,
    stationLabel: body.stationLabel,
    snapshot: body.snapshot,
  });

  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: result.error.code.endsWith("invalid_key") ? 401 : 404 });
  }

  return NextResponse.json({ ok: true });
}
