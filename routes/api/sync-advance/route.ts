import { NextResponse } from "next/server";
import { isPluginActive } from "@venore/plugin-sdk";
import { publishOutputEvent } from "../../../runtime/output-bus";
import { advanceSyncCursor } from "../../../runtime/sync-cursor";
import { findAllOutputTokens } from "../../../shared/output-tokens";
import { getOutputState } from "../../../index";

// A TV avisa que chegou ao fim do item atual numa reprodução sincronizada de grupo (v1.8). A
// primeira que reportar avança o cursor da playlist (runtime/sync-cursor.ts); as outras caem no
// debounce e são ignoradas. Sem sessão/RBAC — acesso por token, mesmo racional de beacon/state.
//
// Reusa getOutputState pra saber a playlist sincronizada e a ordem dos itens (o estado já resolve
// tudo isso, inclusive se este grupo é sincronizado — `sync` só vem preenchido nesse caso).
export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }): Promise<Response> {
  if (!(await isPluginActive("broadcast"))) {
    return NextResponse.json({ error: "O plugin Broadcast Studio está desabilitado." }, { status: 404 });
  }

  const { token } = await params;

  let body: { itemId?: unknown };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Corpo inválido." }, { status: 400 });
  }
  const reportedItemId = typeof body.itemId === "string" ? body.itemId : "";
  if (!reportedItemId) return new NextResponse(null, { status: 204 });

  const state = await getOutputState({ token });
  if (!state.success || !state.data.sync) return new NextResponse(null, { status: 204 });

  const { playlistId } = state.data.sync;
  const orderedIds = (state.data.playlistItemsByPlaylistId[playlistId] ?? []).map((item) => item.id);
  const advanced = advanceSyncCursor(playlistId, reportedItemId, orderedIds);

  if (advanced) {
    // Empurra pra todas as telas rebuscarem o estado — as sincronizadas pulam pro item novo, as
    // demais ignoram (o `sync` delas é null). Mesmo padrão de alert-changed.
    for (const outputToken of await findAllOutputTokens()) {
      publishOutputEvent(outputToken, { type: "sync-changed" });
    }
  }

  return new NextResponse(null, { status: 204 });
}
