import { and, asc, desc, eq, gt, gte, isNull, lte, or } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import {
  broadcastAgendaEventDates,
  broadcastAgendaEvents,
  broadcastAgendas,
  broadcastAlerts,
  broadcastLayers,
  broadcastOutputAgendas,
  broadcastOutputPlaylistSchedule,
  broadcastOutputs,
  broadcastPlaylistItems,
  broadcastScenes,
  broadcastTakeover,
} from "../../../database/schema";
import { isAgendaEventUpcoming } from "../../../shared/agenda-occurrences";
import type {
  BroadcastAgendaEventDate,
  BroadcastAgendaEventRecord,
  BroadcastAgendaRecord,
  BroadcastLayerRecord,
  BroadcastOutputRecord,
  BroadcastPlaylistItemRecord,
  BroadcastSceneRecord,
} from "../../../contracts/types";

// Datas avulsas de um conjunto de eventos, agrupadas por eventId (ordenadas por início). Uma
// query só pra toda a tabela — ela é pequena (poucas linhas por evento) e o filtro de "qual
// evento" acontece em JS, mesmo racional de findAllOutputAgendaLinks.
async function findAgendaEventDatesByEventId(): Promise<Map<string, BroadcastAgendaEventDate[]>> {
  const rows = await db
    .select({
      id: broadcastAgendaEventDates.id,
      eventId: broadcastAgendaEventDates.eventId,
      startAt: broadcastAgendaEventDates.startAt,
      endAt: broadcastAgendaEventDates.endAt,
    })
    .from(broadcastAgendaEventDates)
    .orderBy(asc(broadcastAgendaEventDates.startAt));
  const byEventId = new Map<string, BroadcastAgendaEventDate[]>();
  for (const row of rows) {
    const bucket = byEventId.get(row.eventId) ?? [];
    bucket.push({ id: row.id, startAt: row.startAt, endAt: row.endAt });
    byEventId.set(row.eventId, bucket);
  }
  return byEventId;
}

export async function findOutputByToken(token: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.token, token)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

export async function findSceneById(id: string): Promise<BroadcastSceneRecord | null> {
  const [row] = await db.select().from(broadcastScenes).where(eq(broadcastScenes.id, id)).limit(1);
  return (row as BroadcastSceneRecord) ?? null;
}

export async function findLayersBySceneId(sceneId: string): Promise<BroadcastLayerRecord[]> {
  const rows = await db
    .select()
    .from(broadcastLayers)
    .where(eq(broadcastLayers.sceneId, sceneId))
    .orderBy(asc(broadcastLayers.zIndex));
  return rows as BroadcastLayerRecord[];
}

// Só itens visíveis (hidden = false) — esconder um item na playlist (Fase 6) precisa
// desaparecer da reprodução na TV sem precisar apagar o cadastro. Desempate por createdAt/id
// depois de order: dois itens com o mesmo order (achado real — duas rotas de "adicionar" podem
// calcular o mesmo "próximo order" se rodarem próximas no tempo) deixavam a ordem entre eles
// instável entre uma leitura e outra do Postgres (sem ORDER BY secundário, empate não tem ordem
// garantida) — isso fazia o índice de rotação do client (PlaylistLayer) apontar pra um item
// diferente do que apontava antes depois de um refetch de estado, "pulando"/travando a playlist.
export async function findVisiblePlaylistItemsByPlaylistId(playlistId: string): Promise<BroadcastPlaylistItemRecord[]> {
  // Além de `hidden`, respeita a janela de validade opcional (visible_from/visible_until) — o item
  // some da reprodução fora dela sem ser apagado (ver database/schema/index.ts). "now" é o instante
  // da resolução do estado; a próxima resincronização da TV (SSE/poll) reavalia.
  const now = new Date();
  const rows = await db
    .select()
    .from(broadcastPlaylistItems)
    .where(
      and(
        eq(broadcastPlaylistItems.playlistId, playlistId),
        eq(broadcastPlaylistItems.hidden, false),
        or(isNull(broadcastPlaylistItems.visibleFrom), lte(broadcastPlaylistItems.visibleFrom, now)),
        or(isNull(broadcastPlaylistItems.visibleUntil), gte(broadcastPlaylistItems.visibleUntil, now)),
      ),
    )
    .orderBy(asc(broadcastPlaylistItems.order), asc(broadcastPlaylistItems.createdAt), asc(broadcastPlaylistItems.id));
  return rows as BroadcastPlaylistItemRecord[];
}

// Slots de dayparting desta tela (ver shared/playlist-schedule.ts) — a resolução de "qual casa
// agora" acontece no service, aqui só a leitura.
export async function findPlaylistScheduleForOutput(
  outputId: string,
): Promise<{ playlistId: string; days: number; startMinute: number; endMinute: number }[]> {
  return db
    .select({
      playlistId: broadcastOutputPlaylistSchedule.playlistId,
      days: broadcastOutputPlaylistSchedule.days,
      startMinute: broadcastOutputPlaylistSchedule.startMinute,
      endMinute: broadcastOutputPlaylistSchedule.endMinute,
    })
    .from(broadcastOutputPlaylistSchedule)
    .where(eq(broadcastOutputPlaylistSchedule.outputId, outputId))
    .orderBy(asc(broadcastOutputPlaylistSchedule.startMinute), asc(broadcastOutputPlaylistSchedule.createdAt));
}

// Mesmo racional de desempate de findVisiblePlaylistItemsByPlaylistId acima.
export async function findAllAgendas(): Promise<BroadcastAgendaRecord[]> {
  const rows = await db
    .select()
    .from(broadcastAgendas)
    .orderBy(asc(broadcastAgendas.order), asc(broadcastAgendas.createdAt), asc(broadcastAgendas.id));
  return rows as BroadcastAgendaRecord[];
}

// Todos os eventos "no ar" de todas as agendas — buscados junto com suas datas avulsas (duas
// queries, agrupamento por evento/agenda em JS no service, sem N+1). O filtro de "no ar" mora numa
// helper pura (isAgendaEventUpcoming, shared/agenda-occurrences.ts) porque agora depende das datas
// extras — mais simples testar/entender em JS do que um SQL com MAX sobre um join. Um evento
// não-recorrente continua na lista enquanto a ÚLTIMA data (primária OU extra) ainda não terminou;
// recorrente entra sempre (startAt é só a âncora do padrão semanal, ver shared/weekly-recurrence.ts).
//
// A ordem por startAt aqui é só um pré-filtro grosseiro — a ordem real (por ocorrência efetiva)
// acontece em JS no service.
export async function findAllUpcomingAgendaEvents(): Promise<BroadcastAgendaEventRecord[]> {
  const now = new Date();
  const [rows, datesByEventId] = await Promise.all([
    db.select().from(broadcastAgendaEvents).orderBy(asc(broadcastAgendaEvents.startAt)),
    findAgendaEventDatesByEventId(),
  ]);
  return (rows as Omit<BroadcastAgendaEventRecord, "extraDates">[])
    .map((row) => ({ ...row, extraDates: datesByEventId.get(row.id) ?? [] }))
    .filter((event) => isAgendaEventUpcoming(event, now));
}

// Tabela inteira (pequena — um vínculo por linha) carregada de uma vez; o filtro "essa agenda
// aparece nesta saída?" é feito em JS no service (resolveAgendaRotation), não aqui — ver comentário
// no schema (broadcastOutputAgendas) pra entender o modelo "opt-in" (sem linha = não aparece em
// nenhuma saída).
export async function findAllOutputAgendaLinks(): Promise<{ outputId: string; agendaId: string }[]> {
  return db.select({ outputId: broadcastOutputAgendas.outputId, agendaId: broadcastOutputAgendas.agendaId }).from(broadcastOutputAgendas);
}

// Resolve o evento único de um item de playlist "agenda-event" — null quando o evento referenciado
// não existe mais (a FK cascade já teria apagado o item de playlist junto, mas uma corrida entre
// leitura e escrita pode deixar a leitura em voo pegar o estado anterior; classifyPlaylistItem
// degrada bem pra esse caso, mesmo racional de bloco de notícias vazio).
export async function findAgendaEventById(id: string): Promise<BroadcastAgendaEventRecord | null> {
  const [row] = await db.select().from(broadcastAgendaEvents).where(eq(broadcastAgendaEvents.id, id)).limit(1);
  if (!row) return null;
  const extraDates = await db
    .select({
      id: broadcastAgendaEventDates.id,
      startAt: broadcastAgendaEventDates.startAt,
      endAt: broadcastAgendaEventDates.endAt,
    })
    .from(broadcastAgendaEventDates)
    .where(eq(broadcastAgendaEventDates.eventId, id))
    .orderBy(asc(broadcastAgendaEventDates.startAt));
  return { ...(row as Omit<BroadcastAgendaEventRecord, "extraDates">), extraDates: extraDates as BroadcastAgendaEventDate[] };
}

// O aviso ativo é o mais recentemente publicado ainda não expirado — não há conceito de "fila",
// um novo aviso publicado só substitui o anterior (ver publish-alert), mesmo que o anterior ainda
// não tenha expirado. Devolve o expiresAt junto: o client precisa dele pra esconder a faixa no
// instante exato do vencimento, sem esperar o poll de 15s (que fazia um aviso de 10s ficar ~20s
// na tela).
export async function findActiveAlert(): Promise<{ message: string; expiresAt: Date } | null> {
  const [row] = await db
    .select({ message: broadcastAlerts.message, expiresAt: broadcastAlerts.expiresAt })
    .from(broadcastAlerts)
    .where(gt(broadcastAlerts.expiresAt, new Date()))
    .orderBy(desc(broadcastAlerts.createdAt))
    .limit(1);
  return row ?? null;
}

export async function findActiveTakeover(): Promise<{ message: string; mediaAssetId: string | null; expiresAt: Date } | null> {
  const [row] = await db
    .select({
      message: broadcastTakeover.message,
      mediaAssetId: broadcastTakeover.mediaAssetId,
      expiresAt: broadcastTakeover.expiresAt,
    })
    .from(broadcastTakeover)
    .where(gt(broadcastTakeover.expiresAt, new Date()))
    .orderBy(desc(broadcastTakeover.createdAt))
    .limit(1);
  return row ?? null;
}
