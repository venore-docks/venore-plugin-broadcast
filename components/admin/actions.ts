"use server";

import { revalidatePath } from "next/cache";
import {
  addAgendaEventPlaylistItem,
  addMediaAssetPlaylistItem,
  addMetricsBoardPlaylistItem,
  addScannedPlaylistItems,
  addWebpagePlaylistItem,
  checkWebpageEmbeddable,
  clearAlert,
  createAgenda,
  createAgendaEvent,
  bulkOutputAction,
  clearTakeover,
  createOutput,
  createPlaylist,
  delegateOutput,
  deleteAgenda,
  deleteAgendaEvent,
  deleteOutput,
  deletePlaylist,
  deletePlaylistItem,
  duplicateOutput,
  duplicatePlaylist,
  importAgendaCsv,
  inspectVideosFolder,
  listConnectedOutputIps,
  listOutputPinBlocks,
  listOutputTelemetry,
  listPlaybackStats,
  publishAlert,
  publishTakeover,
  reloadOutput,
  reorderAgendas,
  rotateOutputToken,
  reorderPlaylistItems,
  resetOutputPinAttempts,
  scanPlaylistFolder,
  setAgendaEditors,
  setAgendaOutputs,
  setOutputAgendaSchedule,
  setOutputDrawer,
  setOutputEditors,
  setOutputFooter,
  setOutputFallback,
  setOutputFrozen,
  setOutputGroup,
  setOutputHours,
  setOutputOffline,
  setOutputPin,
  setOutputPlaylist,
  setOutputPlaylistSchedule,
  setOutputTicker,
  setPlaylistEditors,
  togglePlaylistItemVisibility,
  updateAgenda,
  updateAgendaEvent,
  updatePlaylistItem,
  BROADCAST_SETTINGS,
} from "../../index";
import { getSetting, setSetting } from "@venore/plugin-sdk/settings";
import { importActivePluginBarrel, isPluginActive } from "@venore/plugin-sdk";
import { isValidTimeZone, normalizeTimeZone, parseWallTimeInZone } from "../../shared/timezone";
import { parseTimeToMinutes } from "../../shared/playlist-schedule";
import type { BroadcastOutputRecord } from "../../contracts/types";
import type { OutputBeaconSummary, PlaybackStat, VideosFolderHealth } from "../../index";

export type BroadcastActionState = { error: string | null };

// Toggles de controle ao vivo de UMA tela (agenda/rodapé/ticker/ciclo/playlist/PIN) NÃO chamam
// revalidatePath: re-executar o loader inteiro de BroadcastAdminPage (~15 queries + resolução de
// mídia, ver routes/admin/page.tsx) a cada clique deixava o controle ao vivo lento. Em vez disso a
// action devolve o registro atualizado da saída e o componente de seção reflete o clique na hora
// (estado otimista), confirmado por este retorno. A TV continua reagindo via SSE
// (publishOutputEvent dentro do service), independente do admin. create/delete/reorder/editors/
// settings continuam com revalidatePath — mudam a ESTRUTURA da página, não só um widget.
export type BroadcastOutputToggleState = { error: string | null; output: BroadcastOutputRecord | null };

// setOutputPlaylist não expõe a playlist no BroadcastOutputRecord (mora na config da camada de
// vídeo, ver resolve-output-playlist-ids.ts) — a action só ecoa o id recebido pro componente
// confirmar o valor que já aplicou de forma otimista.
export type SetOutputPlaylistState = { error: string | null; playlistId: string | null };

const returnTo = "/admin/broadcast";
const PLUGIN_DISABLED_ERROR = "O plugin Broadcast Studio está desabilitado.";

function requireString(formData: FormData, field: string): string {
  return String(formData.get(field) ?? "").trim();
}

function requireNumber(formData: FormData, field: string, fallback: number): number {
  const raw = formData.get(field);
  if (raw === null || raw === "") return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

function optionalNumber(formData: FormData, field: string): number | null {
  const raw = formData.get(field);
  if (raw === null || raw === "") return null;
  const value = Number(raw);
  return Number.isFinite(value) ? value : null;
}

// "" (campo de término vazio, opcional) vira undefined — mesmo racional de optionalNumber, mas
// pra data. A string "YYYY-MM-DDTHH:mm" do <input datetime-local> é interpretada como hora de
// PAREDE no fuso da instituição (broadcast.timezone) e convertida pra instante UTC — nunca mais
// `new Date(raw)`, que dependia do fuso do processo do servidor. Mesmo tratamento do startAt.
function optionalDateInZone(formData: FormData, field: string, timeZone: string): Date | undefined {
  const raw = requireString(formData, field);
  if (!raw) return undefined;
  const value = parseWallTimeInZone(raw, timeZone);
  return value && !Number.isNaN(value.getTime()) ? value : undefined;
}

// Datas extras do evento chegam como JSON num campo hidden (mesmo padrão de outputIds/agendaIds):
// [{ startAt: "YYYY-MM-DDTHH:mm", endAt: "YYYY-MM-DDTHH:mm" | null }]. Cada string de parede é
// interpretada no fuso da instituição, igual startAt/endAt. Linha sem início válido é descartada
// aqui (lenient) — a validação de negócio fina fica na feature. Campo ausente/ inválido = [].
function parseExtraDatesInZone(formData: FormData, timeZone: string): { startAt: Date; endAt: Date | null }[] {
  const raw = requireString(formData, "extraDates");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const result: { startAt: Date; endAt: Date | null }[] = [];
  for (const entry of parsed) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as { startAt?: unknown; endAt?: unknown };
    const startAt = typeof record.startAt === "string" && record.startAt ? parseWallTimeInZone(record.startAt, timeZone) : null;
    if (!startAt || Number.isNaN(startAt.getTime())) continue;
    const endRaw = typeof record.endAt === "string" && record.endAt ? parseWallTimeInZone(record.endAt, timeZone) : null;
    result.push({ startAt, endAt: endRaw && !Number.isNaN(endRaw.getTime()) ? endRaw : null });
  }
  return result;
}

export async function createPlaylistAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await createPlaylist({ name: requireString(formData, "name") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Substitui o conjunto inteiro de responsáveis desta playlist — mesmo padrão de
// setAgendaEditorsAction/setOutputEditorsAction.
export async function setPlaylistEditorsAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const playlistId = requireString(formData, "playlistId");
  let userIds: string[];
  try {
    userIds = JSON.parse(String(formData.get("userIds") ?? "[]"));
  } catch {
    return { error: "Seleção de responsáveis inválida." };
  }

  const result = await setPlaylistEditors({ playlistId, userIds });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function deletePlaylistAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await deletePlaylist({ playlistId: requireString(formData, "playlistId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// "Duplicar playlist" — cria "Cópia de X" (compartilhada) com todos os itens. Estrutural.
export async function duplicatePlaylistAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await duplicatePlaylist({ playlistId: requireString(formData, "playlistId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Estado próprio (não o BroadcastActionState genérico) — o scan agora é só uma prévia de leitura
// (pedido: "quero poder escolher o que entra... e o que não entra"), então a ação precisa devolver
// os candidatos pro client renderizar os checkboxes, não só sucesso/erro. Sem revalidatePath aqui
// de propósito: nada foi gravado ainda.
export type ScanPlaylistFolderState = {
  error: string | null;
  toAdd: string[];
  toRemove: { id: string; relativePath: string }[];
};

// "video" (padrão) ou "image" — mesmo racional de PlaylistFolderScanKind (scan-playlist-folder/
// types.ts). Um valor fora desse par (form adulterado) cai em "video", nunca quebra a action.
function requireFolderScanKind(formData: FormData): "video" | "image" {
  return formData.get("kind") === "image" ? "image" : "video";
}

export async function scanPlaylistFolderAction(
  _prevState: ScanPlaylistFolderState,
  formData: FormData,
): Promise<ScanPlaylistFolderState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, toAdd: [], toRemove: [] };

  const result = await scanPlaylistFolder({
    playlistId: requireString(formData, "playlistId"),
    kind: requireFolderScanKind(formData),
  });
  if (!result.success) return { error: result.error.message, toAdd: [], toRemove: [] };

  return { error: null, toAdd: result.data.toAdd, toRemove: result.data.toRemove };
}

export async function addScannedPlaylistItemsAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const playlistId = requireString(formData, "playlistId");
  const kind = requireFolderScanKind(formData);
  let relativePaths: string[];
  try {
    relativePaths = JSON.parse(String(formData.get("relativePaths") ?? "[]"));
  } catch {
    return { error: "Seleção de itens inválida." };
  }

  const result = await addScannedPlaylistItems({ playlistId, kind, relativePaths });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function addMediaAssetPlaylistItemAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await addMediaAssetPlaylistItem({
    playlistId: requireString(formData, "playlistId"),
    mediaAssetId: requireString(formData, "mediaAssetId"),
    title: requireString(formData, "title") || undefined,
    durationSeconds: optionalNumber(formData, "durationSeconds"),
    withAudio: formData.get("withAudio") === "on",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function addWebpagePlaylistItemAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await addWebpagePlaylistItem({
    playlistId: requireString(formData, "playlistId"),
    url: requireString(formData, "url"),
    title: requireString(formData, "title") || undefined,
    durationSeconds: optionalNumber(formData, "durationSeconds"),
    withAudio: formData.get("withAudio") === "on",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Atalho "Painel de métricas" (§9.3) — só aparece na UI quando o plugin company-metrics está
// ativo. listMetricsBoardOptionsAction devolve [] quando inativo, o que naturalmente esconde a
// aba. addMetricsBoardPlaylistItemAction delega ao handler do broadcast, que revalida a
// atividade do plugin em runtime.
export async function listMetricsBoardOptionsAction(): Promise<{ token: string; label: string }[]> {
  const companyMetrics = await importActivePluginBarrel<{
    listMetricsBoards: () => Promise<{ success: boolean; data?: { token: string; label: string }[] }>;
  }>("company-metrics");
  if (!companyMetrics) return [];
  const result = await companyMetrics.listMetricsBoards();
  return result.success && result.data ? result.data : [];
}

export async function addMetricsBoardPlaylistItemAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await addMetricsBoardPlaylistItem({
    playlistId: requireString(formData, "playlistId"),
    boardToken: requireString(formData, "boardToken"),
    title: requireString(formData, "title") || undefined,
    durationSeconds: optionalNumber(formData, "durationSeconds"),
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updatePlaylistItemAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  // Janela de validade: campo <input type="datetime-local"> vazio → null (sem borda), não undefined
  // — o formulário de edição sempre renderiza os dois, então "vazio" significa "sem limite".
  // A string de parede é interpretada no fuso da instituição, igual startAt de evento de agenda.
  const timeZone = await getBroadcastTimezone();
  const result = await updatePlaylistItem({
    itemId: requireString(formData, "itemId"),
    title: requireString(formData, "title") || undefined,
    durationSeconds: optionalNumber(formData, "durationSeconds"),
    url: requireString(formData, "url") || undefined,
    withAudio: formData.get("withAudio") === "on",
    visibleFrom: optionalDateInZone(formData, "visibleFrom", timeZone) ?? null,
    visibleUntil: optionalDateInZone(formData, "visibleUntil", timeZone) ?? null,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function addAgendaEventPlaylistItemAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await addAgendaEventPlaylistItem({
    playlistId: requireString(formData, "playlistId"),
    agendaEventId: requireString(formData, "agendaEventId"),
    durationSeconds: optionalNumber(formData, "durationSeconds"),
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function togglePlaylistItemVisibilityAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await togglePlaylistItemVisibility({
    itemId: requireString(formData, "itemId"),
    hidden: formData.get("hidden") === "true",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function deletePlaylistItemAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await deletePlaylistItem({ itemId: requireString(formData, "itemId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Botões "mover pra cima/baixo" reenviam a lista inteira já reordenada (JSON) — mesmo padrão de
// academy (reorderLessonSectionsAction): mais simples e mais robusto (funciona em qualquer
// dispositivo/teclado, sem depender de drag-and-drop) que manter uma lib de arrastar-soltar só
// pra isto.
export async function reorderPlaylistItemsAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const playlistId = requireString(formData, "playlistId");
  let itemIds: string[];
  try {
    itemIds = JSON.parse(String(formData.get("itemIds") ?? "[]"));
  } catch {
    return { error: "Ordem de itens inválida." };
  }

  const result = await reorderPlaylistItems({ playlistId, itemIds });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Cria a saída já com sua cena padrão de 3 camadas fixas provisionada (vídeo tocando a playlist
// escolhida + agenda + aviso rápido) — ver create-output/store.ts. Nenhuma configuração manual de
// cena/camada existe mais nesta tela (pedido explícito: "você já define isso").
export async function createOutputAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const template = requireString(formData, "template");
  const result = await createOutput({
    name: requireString(formData, "name"),
    template: template === "video" || template === "video-rodape" ? template : "completo",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Troca qual playlist a camada de vídeo da saída toca — único jeito de mudar "o que passa" depois
// que a saída já foi criada, já que não existe mais tela de cenas/camadas.
export async function setOutputPlaylistAction(_prevState: BroadcastActionState, formData: FormData): Promise<SetOutputPlaylistState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, playlistId: null };

  const playlistId = requireString(formData, "playlistId");
  const result = await setOutputPlaylist({
    outputId: requireString(formData, "outputId"),
    playlistId,
  });
  if (!result.success) return { error: result.error.message, playlistId: null };

  return { error: null, playlistId };
}

export async function setOutputDrawerAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputDrawer({
    outputId: requireString(formData, "outputId"),
    drawerOpen: formData.get("drawerOpen") === "true",
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

// "" (campo vazio) ou "0" viram null — mesmo racional de SetOutputPinForm/RemoveOutputPinButton
// (campo vazio remove a configuração, não é erro). Os dois campos formam um par (ver
// service.ts) — o form sempre manda os dois juntos.
export async function setOutputAgendaScheduleAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputAgendaSchedule({
    outputId: requireString(formData, "outputId"),
    agendaOpenSeconds: optionalNumber(formData, "agendaOpenSeconds"),
    agendaPauseSeconds: optionalNumber(formData, "agendaPauseSeconds"),
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

export async function setOutputFooterAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputFooter({
    outputId: requireString(formData, "outputId"),
    footerOpen: formData.get("footerOpen") === "true",
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

export async function setOutputTickerAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputTicker({
    outputId: requireString(formData, "outputId"),
    tickerEnabled: formData.get("tickerEnabled") === "true",
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

// Tela de espera branded ligada de propósito pelo admin (Fase 11) — mesmo padrão otimista dos
// toggles acima (sem revalidatePath, devolve o registro atualizado; a TV troca via SSE).
export async function setOutputOfflineAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputOffline({
    outputId: requireString(formData, "outputId"),
    offline: formData.get("offline") === "true",
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

// "" (campo vazio, ou o form dedicado de RemoveOutputPinButton) vira null — remove a proteção.
export async function setOutputPinAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputPin({
    outputId: requireString(formData, "outputId"),
    pin: requireString(formData, "pin") || null,
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

// Libera o limitador de tentativas de PIN (brute force) desta tela — zera o contador em memória de
// todos os IPs do token. Sem revalidatePath: nada muda na estrutura da página, o feedback é só o
// toast (ver OutputPinSection em outputs-section.tsx).
export async function resetOutputPinAttemptsAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await resetOutputPinAttempts({ outputId: requireString(formData, "outputId") });
  if (!result.success) return { error: result.error.message };

  return { error: null };
}

// Rótulo de grupo de uma tela — vazio = tira do grupo.
export async function setOutputGroupAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await setOutputGroup({
    outputId: requireString(formData, "outputId"),
    groupName: requireString(formData, "groupName") || null,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Ação em lote sobre um grupo de telas (recarregar / modo espera). A TV reage via SSE; offline
// também grava no banco, então revalidatePath pra refletir o toggle no card.
export async function bulkOutputActionAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const action = requireString(formData, "action");
  const result = await bulkOutputAction({
    groupName: requireString(formData, "groupName"),
    action: action === "offline-on" || action === "offline-off" ? action : "reload",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Fallback de conteúdo da tela — imagem/vídeo da biblioteca (id) + mensagem. Campos vazios = null.
export async function setOutputFallbackAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  // Cada campo só entra se o form o enviou (formData.has) — a mensagem e a mídia têm forms
  // separados no admin, então salvar um não zera o outro.
  const result = await setOutputFallback({
    outputId: requireString(formData, "outputId"),
    mediaAssetId: formData.has("mediaAssetId") ? requireString(formData, "mediaAssetId") || null : undefined,
    message: formData.has("message") ? requireString(formData, "message") || null : undefined,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Horário de funcionamento da tela — dias (bitmask) + início/fim como "HH:MM". Tudo vazio = desliga.
export async function setOutputHoursAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const rawDays = formData.get("days");
  const rawStart = requireString(formData, "startTime");
  const rawEnd = requireString(formData, "endTime");
  const days = rawDays === null || rawDays === "" ? null : Number(rawDays);
  const startMinute = rawStart ? parseTimeToMinutes(rawStart) : null;
  const endMinute = rawEnd ? parseTimeToMinutes(rawEnd) : null;

  const result = await setOutputHours({
    outputId: requireString(formData, "outputId"),
    days: days && Number.isFinite(days) && days > 0 ? days : null,
    startMinute,
    endMinute,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Dayparting — substitui o conjunto inteiro de faixas de horário desta tela. slots chega como JSON
// num campo hidden (mesmo padrão de userIds/outputIds das outras actions de "reenviar a lista").
export async function setOutputPlaylistScheduleAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  let parsed: unknown;
  try {
    parsed = JSON.parse(String(formData.get("slots") ?? "[]"));
  } catch {
    return { error: "Programação inválida." };
  }
  if (!Array.isArray(parsed)) return { error: "Programação inválida." };

  const result = await setOutputPlaylistSchedule({
    outputId: requireString(formData, "outputId"),
    slots: (parsed as unknown[]).map((raw) => {
      const slot = (raw ?? {}) as Record<string, unknown>;
      return {
        playlistId: String(slot.playlistId ?? ""),
        days: Number(slot.days ?? 0),
        startMinute: Number(slot.startMinute ?? 0),
        endMinute: Number(slot.endMinute ?? 0),
      };
    }),
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Manda a(s) TV(s) desta tela recarregarem — a TV reage via SSE (evento "reload"), nada muda no
// admin, então sem revalidatePath.
export async function reloadOutputAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await reloadOutput({ outputId: requireString(formData, "outputId") });
  if (!result.success) return { error: result.error.message };

  return { error: null };
}

// Gera um token novo pra tela — o link antigo para de funcionar. O card mostra o link novo
// (revalidatePath: o token faz parte de BroadcastOutputRecord, então o card remonta com o valor
// novo via `key`).
export async function rotateOutputTokenAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await rotateOutputToken({ outputId: requireString(formData, "outputId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// "Duplicar tela" — cria "Cópia de X" com playlist dedicada, itens e ajustes de exibição copiados
// (sem token/PIN/responsáveis/vínculos/programação). Estrutural → revalidatePath.
export async function duplicateOutputAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await duplicateOutput({ outputId: requireString(formData, "outputId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function deleteOutputAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await deleteOutput({ outputId: requireString(formData, "outputId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Substitui o conjunto inteiro de responsáveis desta saída — mesmo padrão de
// setAgendaEditorsAction.
export async function setOutputEditorsAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const outputId = requireString(formData, "outputId");
  let userIds: string[];
  try {
    userIds = JSON.parse(String(formData.get("userIds") ?? "[]"));
  } catch {
    return { error: "Seleção de responsáveis inválida." };
  }

  const result = await setOutputEditors({ outputId, userIds });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// "Delegar a tela inteira" (atalho) — grava a pessoa como responsável da tela + playlist(s) que
// ela toca + agenda(s) vinculadas de uma vez. mode "grant" adiciona, "revoke" remove das três.
// O ajuste fino recurso a recurso continua nos set-*-editors acima.
export async function delegateOutputAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await delegateOutput({
    outputId: requireString(formData, "outputId"),
    userId: requireString(formData, "userId"),
    mode: requireString(formData, "mode") === "revoke" ? "revoke" : "grant",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function createAgendaAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await createAgenda({
    name: requireString(formData, "name"),
    displaySeconds: optionalNumber(formData, "displaySeconds") ?? undefined,
    backgroundColor: requireString(formData, "backgroundColor") || undefined,
    logoMediaAssetId: requireString(formData, "logoMediaAssetId") || undefined,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateAgendaAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await updateAgenda({
    agendaId: requireString(formData, "agendaId"),
    name: requireString(formData, "name"),
    displaySeconds: requireNumber(formData, "displaySeconds", 20),
    backgroundColor: requireString(formData, "backgroundColor") || undefined,
    logoMediaAssetId: requireString(formData, "logoMediaAssetId") || undefined,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Mesmo padrão de reorderPlaylistItemsAction — botões mover pra cima/baixo, lista inteira via JSON.
export async function reorderAgendasAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  let agendaIds: string[];
  try {
    agendaIds = JSON.parse(String(formData.get("agendaIds") ?? "[]"));
  } catch {
    return { error: "Ordem de agendas inválida." };
  }

  const result = await reorderAgendas({ agendaIds });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Substitui o conjunto inteiro de saídas vinculadas a esta agenda (checkboxes, todas resubmetidas
// via JSON) — vazio é um valor válido ("não aparece em nenhuma saída", ver comentário no schema).
export async function setAgendaOutputsAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const agendaId = requireString(formData, "agendaId");
  let outputIds: string[];
  try {
    outputIds = JSON.parse(String(formData.get("outputIds") ?? "[]"));
  } catch {
    return { error: "Seleção de saídas inválida." };
  }

  const result = await setAgendaOutputs({ agendaId, outputIds });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

// Substitui o conjunto inteiro de responsáveis desta agenda — pedido explícito: "adicionar um
// responsável (role editor pra cima) com acesso e permissão para alterar apenas a agenda
// atribuída". Mesmo padrão de setAgendaOutputsAction (checkboxes, JSON).
export async function setAgendaEditorsAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const agendaId = requireString(formData, "agendaId");
  let userIds: string[];
  try {
    userIds = JSON.parse(String(formData.get("userIds") ?? "[]"));
  } catch {
    return { error: "Seleção de responsáveis inválida." };
  }

  const result = await setAgendaEditors({ agendaId, userIds });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function deleteAgendaAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await deleteAgenda({ agendaId: requireString(formData, "agendaId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export type ImportAgendaCsvState = { error: string | null; summary: string | null };

// Importa eventos de um CSV colado/enviado numa agenda. Devolve um resumo (criados/pulados +
// primeiras linhas com erro) pro componente mostrar, não só sucesso/erro.
export async function importAgendaCsvAction(_prevState: ImportAgendaCsvState, formData: FormData): Promise<ImportAgendaCsvState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, summary: null };

  const timeZone = await getBroadcastTimezone();
  const result = await importAgendaCsv({
    agendaId: requireString(formData, "agendaId"),
    csv: String(formData.get("csv") ?? ""),
    timeZone,
  });
  if (!result.success) return { error: result.error.message, summary: null };

  revalidatePath(returnTo);
  const { created, skipped, errors } = result.data;
  const parts = [`${created} evento${created === 1 ? "" : "s"} importado${created === 1 ? "" : "s"}`];
  if (skipped > 0) parts.push(`${skipped} linha${skipped === 1 ? "" : "s"} ignorada${skipped === 1 ? "" : "s"}`);
  const summary = parts.join(" · ") + (errors.length > 0 ? `\n${errors.join("\n")}` : "");
  return { error: null, summary };
}

export async function createAgendaEventAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  // Hora de parede digitada no admin → instante UTC, interpretada no fuso da instituição
  // (broadcast.timezone). `new Date(NaN)` quando a string está vazia/malformada — o validador da
  // feature devolve "data inválida" a partir daí, como já fazia com `new Date("")`.
  const timeZone = await getBroadcastTimezone();
  const startAt = parseWallTimeInZone(requireString(formData, "startAt"), timeZone) ?? new Date(NaN);

  const result = await createAgendaEvent({
    agendaId: requireString(formData, "agendaId"),
    title: requireString(formData, "title"),
    description: requireString(formData, "description") || undefined,
    startAt,
    recurring: formData.get("recurring") === "on",
    endAt: optionalDateInZone(formData, "endAt", timeZone),
    extraDates: parseExtraDatesInZone(formData, timeZone),
    coverMediaAssetId: requireString(formData, "coverMediaAssetId") || undefined,
    location: requireString(formData, "location") || undefined,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateAgendaEventAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const timeZone = await getBroadcastTimezone();
  const startAt = parseWallTimeInZone(requireString(formData, "startAt"), timeZone) ?? new Date(NaN);

  const result = await updateAgendaEvent({
    eventId: requireString(formData, "eventId"),
    title: requireString(formData, "title"),
    description: requireString(formData, "description") || undefined,
    startAt,
    recurring: formData.get("recurring") === "on",
    endAt: optionalDateInZone(formData, "endAt", timeZone),
    extraDates: parseExtraDatesInZone(formData, timeZone),
    coverMediaAssetId: requireString(formData, "coverMediaAssetId") || undefined,
    location: requireString(formData, "location") || undefined,
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function deleteAgendaEventAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await deleteAgendaEvent({ eventId: requireString(formData, "eventId") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function publishAlertAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await publishAlert({
    message: requireString(formData, "message"),
    durationSeconds: requireNumber(formData, "durationSeconds", 30),
  });
  if (!result.success) return { error: result.error.message };

  // Sem revalidatePath — o aviso é global e a TV já reage via SSE (publishAlert/service.ts empurra
  // "alert-changed" pra todos os tokens). Não há widget de aviso ativo no admin pra sincronizar, e
  // recarregar a página inteira aqui era justamente o que deixava o controle ao vivo lento.
  return { error: null };
}

// Sem parâmetros declarados de propósito (useActionState sempre chama com (prevState, formData),
// mas nenhum dos dois é usado aqui — TS aceita uma implementação com menos parâmetros que o tipo
// esperado, e assim não sobra parâmetro não utilizado pro lint reclamar).
export async function clearAlertAction(): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await clearAlert();
  if (!result.success) return { error: result.error.message };

  // Sem revalidatePath — mesmo racional de publishAlertAction: a TV reage via SSE, nada no admin
  // depende de um reload pra refletir a remoção.
  return { error: null };
}

// Takeover de urgência — cobre TODAS as telas em tela cheia. Mesmo racional do aviso rápido (sem
// revalidatePath, a TV reage via SSE).
export async function publishTakeoverAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await publishTakeover({
    message: requireString(formData, "message"),
    mediaAssetId: requireString(formData, "mediaAssetId") || null,
    durationSeconds: requireNumber(formData, "durationSeconds", 60),
  });
  if (!result.success) return { error: result.error.message };
  return { error: null };
}

export async function clearTakeoverAction(): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await clearTakeover();
  if (!result.success) return { error: result.error.message };
  return { error: null };
}

// Congelar / descongelar uma tela — toggle ao vivo, mesmo padrão de setOutputDrawer (devolve a
// saída atualizada, sem revalidatePath).
export async function setOutputFrozenAction(_prevState: BroadcastActionState, formData: FormData): Promise<BroadcastOutputToggleState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR, output: null };

  const result = await setOutputFrozen({
    outputId: requireString(formData, "outputId"),
    frozen: formData.get("frozen") === "true",
  });
  if (!result.success) return { error: result.error.message, output: null };

  return { error: null, output: result.data };
}

// Passam por contexts/settings direto (setSetting), gateado por settings.manage — mesmo padrão de
// updateBirthdaysAppearanceAction (admin/birthdays/appearance/actions.ts). Ver comentário no
// manifest.ts sobre por que não existe uma permission "broadcast.settings" própria.
export async function updateBroadcastRegionAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await setSetting({ key: BROADCAST_SETTINGS.region.key, value: requireString(formData, "region") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateBroadcastBrandColorAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await setSetting({ key: BROADCAST_SETTINGS.brandColor.key, value: requireString(formData, "brandColor") });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateBroadcastAgendaAnimationStyleAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const value = requireString(formData, "agendaAnimationStyle");
  const result = await setSetting({
    key: BROADCAST_SETTINGS.agendaAnimationStyle.key,
    value: value === "cascade" ? "cascade" : "fade",
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateBroadcastAgendaViewSizeAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const value = requireString(formData, "agendaViewSize");
  const normalized = value === "padrao" || value === "extra-grande" ? value : "grande";
  const result = await setSetting({ key: BROADCAST_SETTINGS.agendaViewSize.key, value: normalized });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateBroadcastTimezoneAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  // Só aceita um id IANA que o runtime reconhece — o <select> da tela admin já oferece só esses,
  // isto é a defesa contra um POST forjado com lixo.
  const value = requireString(formData, "timezone");
  if (!isValidTimeZone(value)) return { error: "Fuso horário inválido." };

  const result = await setSetting({ key: BROADCAST_SETTINGS.timezone.key, value });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function updateBroadcastNewsExcludeKeywordsAction(
  _prevState: BroadcastActionState,
  formData: FormData,
): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await setSetting({
    key: BROADCAST_SETTINGS.newsExcludeKeywords.key,
    value: requireString(formData, "newsExcludeKeywords"),
  });
  if (!result.success) return { error: result.error.message };

  revalidatePath(returnTo);
  return { error: null };
}

export async function getBroadcastRegion(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.region.key });
  return result.success && typeof result.data?.value === "string" ? result.data.value : "";
}

export async function getBroadcastBrandColor(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.brandColor.key });
  return result.success && typeof result.data?.value === "string" ? result.data.value : BROADCAST_SETTINGS.brandColor.defaultValue;
}

export async function getBroadcastAgendaAnimationStyle(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.agendaAnimationStyle.key });
  const value = result.success ? result.data?.value : null;
  return value === "cascade" ? "cascade" : BROADCAST_SETTINGS.agendaAnimationStyle.defaultValue;
}

export async function getBroadcastAgendaViewSize(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.agendaViewSize.key });
  const value = result.success ? result.data?.value : null;
  return value === "padrao" || value === "extra-grande" ? value : BROADCAST_SETTINGS.agendaViewSize.defaultValue;
}

export async function getBroadcastNewsExcludeKeywords(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.newsExcludeKeywords.key });
  return result.success && typeof result.data?.value === "string" ? result.data.value : "";
}

// Sempre devolve um id IANA válido (default "America/Sao_Paulo" quando não configurado/inválido) —
// mesma normalização usada pelo service da view de saída (get-output-state).
export async function getBroadcastTimezone(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.timezone.key });
  return normalizeTimeZone(result.success ? result.data?.value : null);
}

// IPs conectados agora mesmo, por token — pedido explícito: "vamos criar um sistema em que mostra
// também a quantidade de TVs conectadas" + depois "quero poder saber qual é a TV que conectou.
// Pode ser com o dado de IP local". Chamado direto pelo client (useEffect com polling, ver
// outputs-section.tsx), não por um <form>/useActionState — é só leitura, sem prevState/FormData
// pra combinar. Passa pelo handler (authorizeActor("broadcast.manage")) em vez de ler o bus
// direto: um POST sem sessão de admin volta {} em vez de vazar a lista de IPs. O formato de
// retorno (Record) fica igual pro client — a action desembrulha o OperationResult aqui.
export async function getConnectedOutputIpsAction(): Promise<Record<string, string[]>> {
  if (!(await isPluginActive("broadcast"))) return {};

  const result = await listConnectedOutputIps();
  return result.success ? result.data : {};
}

const diagnosticsReturnTo = "/admin/broadcast/diagnostics";

export async function getBroadcastDiagnosticsAgentKey(): Promise<string> {
  const result = await getSetting({ key: BROADCAST_SETTINGS.diagnosticsAgentKey.key });
  return result.success && typeof result.data?.value === "string" ? result.data.value : "";
}

// Gera uma chave nova (UUID) pro agent PowerShell — sem form/campo de digitar, o operador não
// precisa inventar/lembrar segredo nenhum, só copiar o valor gerado pro topo do script em cada
// estação. Trocar a chave invalida instantaneamente qualquer agent rodando com a chave antiga
// (report-agent-diagnostics compara contra o valor atual do setting a cada request).
export async function regenerateDiagnosticsAgentKeyAction(): Promise<BroadcastActionState> {
  if (!(await isPluginActive("broadcast"))) return { error: PLUGIN_DISABLED_ERROR };

  const result = await setSetting({ key: BROADCAST_SETTINGS.diagnosticsAgentKey.key, value: crypto.randomUUID() });
  if (!result.success) return { error: result.error.message };

  revalidatePath(diagnosticsReturnTo);
  return { error: null };
}

// Tokens com bloqueio de PIN ativo agora — mesmo poll/cadência do de IPs conectados. Lista vazia
// em qualquer erro (plugin off, sem sessão de admin).
export async function getOutputPinBlocksAction(): Promise<string[]> {
  if (!(await isPluginActive("broadcast"))) return [];

  const result = await listOutputPinBlocks();
  return result.success ? result.data : [];
}

// Relatório de exibições (proof-of-play) — agregado das últimas N dias. null em qualquer erro.
export async function getPlaybackStatsAction(
  sinceDays: number,
): Promise<{ sinceDays: number; total: number; stats: PlaybackStat[] } | null> {
  if (!(await isPluginActive("broadcast"))) return null;

  const result = await listPlaybackStats({ sinceDays });
  return result.success ? result.data : null;
}

// Saúde da pasta de vídeos — chamado uma vez ao abrir a aba Playlists. null em qualquer erro.
export async function getVideosFolderHealthAction(): Promise<VideosFolderHealth | null> {
  if (!(await isPluginActive("broadcast"))) return null;

  const result = await inspectVideosFolder();
  return result.success ? result.data : null;
}

// Telemetria das TVs por token (viewport/navegador/status/uptime) — mesmo poll/cadência do de IPs
// conectados. {} em qualquer erro.
export async function getOutputTelemetryAction(): Promise<Record<string, OutputBeaconSummary[]>> {
  if (!(await isPluginActive("broadcast"))) return {};

  const result = await listOutputTelemetry();
  return result.success ? result.data : {};
}

// Sonda best-effort "este site carrega dentro de um iframe na TV?" — chamada pelo formulário de
// item "webpage" no blur da URL. null em qualquer erro (plugin off, sem acesso, URL vazia).
export async function checkWebpageEmbeddableAction(
  url: string,
): Promise<{ embeddable: "yes" | "likely-blocked" | "unknown"; reason: string | null } | null> {
  if (!(await isPluginActive("broadcast"))) return null;

  const result = await checkWebpageEmbeddable({ url });
  return result.success ? result.data : null;
}
