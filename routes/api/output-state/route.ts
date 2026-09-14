import { NextResponse } from "next/server";
import { getOutputState, verifyOutputPin } from "../../../index";
import { checkRateLimit } from "../../../runtime/rate-limit";
import { readOutputPinCookie } from "../../../shared/output-pin-cookie";
import { isPluginActive } from "@venore/plugin-sdk";

// 30 por 10s — folgado o bastante pra qualquer cadência normal de poll/refetch (SSE dispara
// refetch nos eventos, não numa taxa fixa alta), curto o bastante pra segurar um flood. Esta é a
// rota mais cara das 5 gateadas (getOutputState resolve cena/layers/playlist/clima/notícia/
// agenda/alerta inteiros), então o limite mais apertado do grupo.
const RATE_LIMIT = 30;
const RATE_LIMIT_WINDOW_MS = 10_000;

// Snapshot HTTP normal do estado de uma saída — usado pelo client da view de saída (Fase 4) pra
// resincronizar sempre que a rota SSE (./events) avisa que algo mudou, em vez de tentar remontar
// o estado a partir do delta do evento (mais simples e mais robusto contra evento perdido/fora de
// ordem: qualquer evento só significa "vá buscar o estado atual de novo").
export async function GET(_request: Request, { params }: { params: Promise<{ token: string }> }): Promise<NextResponse> {
  if (!(await isPluginActive("broadcast"))) {
    return NextResponse.json({ error: "O plugin Broadcast Studio está desabilitado." }, { status: 404 });
  }

  const { token } = await params;

  if (!checkRateLimit(`output-state:${token}`, RATE_LIMIT, RATE_LIMIT_WINDOW_MS)) {
    return NextResponse.json({ error: "Muitas requisições." }, { status: 429 });
  }

  // Mesma checagem de routes/out/page.tsx — o client já passou pelo gate na primeira carga da
  // página, mas esta rota é acessível direto por qualquer request com o token, então precisa
  // repetir a checagem aqui em vez de confiar que só o browser autorizado vai chamar.
  const pinCookie = await readOutputPinCookie(token);
  const pinCheck = await verifyOutputPin({ token, candidate: pinCookie });
  if (pinCheck.success && pinCheck.data.required && !pinCheck.data.valid) {
    return NextResponse.json({ error: "PIN necessário." }, { status: 401 });
  }

  const result = await getOutputState({ token });
  if (!result.success) {
    return NextResponse.json({ error: result.error.message }, { status: 404 });
  }

  return NextResponse.json(result.data);
}
