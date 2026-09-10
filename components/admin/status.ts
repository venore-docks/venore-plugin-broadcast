// Deriva um "semáforo" (tom + texto curto) pra cada recurso do Broadcast Studio a partir de dado
// já carregado pela página — puro, sem I/O, reaproveitado tanto pelo card individual (outputs/
// playlists/agenda-section.tsx) quanto pelo resumo agregado da aba (admin-overview-nav.tsx).
// Pedido explícito: "quero indicações luminosas e coloridas" + "fácil identificar as áreas" — o
// tom decide a cor (success/warning/muted, vocabulário shadcn já oficial, ver AGENTS.md seção 3),
// o texto decide o que aparece ao lado do ponto/badge.
export type StatusTone = "success" | "warning" | "muted";

export type StatusInfo = { tone: StatusTone; label: string };

// Uma tela só funciona de verdade com uma playlist tocando — agenda é opcional (ver
// OutputStatusRow em outputs-section.tsx pro vínculo de agenda, mostrado à parte).
// "Configurada" (não "Pronta"/"No ar") — este semáforo só diz que a tela TEM playlist, não que
// uma TV está conectada tocando agora. A liveness ("N TVs conectadas") é um sinal à parte no card
// (ConnectedTvsBadge em outputs-section.tsx) — os dois não devem se confundir.
export function outputItemStatus(hasPlaylist: boolean): StatusInfo {
  return hasPlaylist ? { tone: "success", label: "Configurada" } : { tone: "warning", label: "Sem playlist" };
}

export function outputsTabStatus(outputs: { id: string }[], hasPlaylistById: Record<string, boolean>): StatusInfo {
  if (outputs.length === 0) return { tone: "muted", label: "Nenhuma tela ainda" };
  const missing = outputs.filter((output) => !hasPlaylistById[output.id]).length;
  if (missing > 0) return { tone: "warning", label: `${missing} sem playlist` };
  return { tone: "success", label: "Tudo certo" };
}

export function playlistItemStatus(itemCount: number): StatusInfo {
  if (itemCount === 0) return { tone: "warning", label: "Vazia" };
  return { tone: "success", label: `${itemCount} ${itemCount === 1 ? "item" : "itens"}` };
}

export function playlistsTabStatus(playlists: { id: string }[], itemCountById: Record<string, number>): StatusInfo {
  if (playlists.length === 0) return { tone: "muted", label: "Nenhuma playlist ainda" };
  const empty = playlists.filter((playlist) => (itemCountById[playlist.id] ?? 0) === 0).length;
  if (empty > 0) return { tone: "warning", label: `${empty} vazia${empty === 1 ? "" : "s"}` };
  return { tone: "success", label: "Tudo certo" };
}

// Uma agenda sem eventos é só "vazia ainda" (neutro, não é um erro — agenda nova sempre começa
// assim); uma agenda com eventos mas não vinculada a nenhuma tela é o caso que precisa de atenção
// de verdade (o conteúdo existe mas nunca aparece em lugar nenhum).
export function agendaItemStatus(eventCount: number, linkedOutputCount: number): StatusInfo {
  if (eventCount === 0) return { tone: "muted", label: "Sem eventos" };
  const eventsLabel = `${eventCount} ${eventCount === 1 ? "evento" : "eventos"}`;
  if (linkedOutputCount === 0) return { tone: "warning", label: `${eventsLabel} · não aparece em nenhuma tela` };
  return { tone: "success", label: `${eventsLabel} · em ${linkedOutputCount} ${linkedOutputCount === 1 ? "tela" : "telas"}` };
}

export function agendasTabStatus(
  agendas: { id: string }[],
  eventCountById: Record<string, number>,
  linkedOutputCountById: Record<string, number>,
): StatusInfo {
  if (agendas.length === 0) return { tone: "muted", label: "Nenhuma agenda ainda" };
  const needsAttention = agendas.filter(
    (agenda) => (eventCountById[agenda.id] ?? 0) > 0 && (linkedOutputCountById[agenda.id] ?? 0) === 0,
  ).length;
  if (needsAttention > 0) return { tone: "warning", label: `${needsAttention} precisa${needsAttention === 1 ? "" : "m"} de atenção` };
  return { tone: "success", label: "Tudo certo" };
}
