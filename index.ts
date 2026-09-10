// Barrel público do plugin (regra 7/8 do AGENTS.md) — outros contexts/plugins/platform só podem
// importar daqui ou de ./contracts, nunca de ./database/schema, ./features/*/store ou
// ./features/*/service diretamente. Expandido conforme as features de cada fase forem entrando.
export { BROADCAST_SETTINGS } from "./shared/settings";
export type { BroadcastAgendaAnimationStyle, BroadcastAgendaViewSize, BroadcastSettingField } from "./shared/settings";

export {
  BROADCAST_LAYER_TYPES,
  BROADCAST_PLAYLIST_ITEM_SOURCE_TYPES,
} from "./contracts/types";
export type {
  BroadcastSceneRecord,
  BroadcastLayerType,
  BroadcastLayerRecord,
  BroadcastPlaylistRecord,
  BroadcastPlaylistItemSourceType,
  BroadcastPlaylistItemRecord,
  BroadcastOutputRecord,
} from "./contracts/types";

export { createPlaylistHandler as createPlaylist } from "./features/playlists/create-playlist/handler";
export { listPlaylistsHandler as listPlaylists } from "./features/playlists/list-playlists/handler";
export { listPlaylistItemsHandler as listPlaylistItems } from "./features/playlists/list-playlist-items/handler";
export {
  addMediaAssetPlaylistItemHandler as addMediaAssetPlaylistItem,
} from "./features/playlists/add-media-asset-playlist-item/handler";
export { deletePlaylistItemHandler as deletePlaylistItem } from "./features/playlists/delete-playlist-item/handler";
export { deletePlaylistHandler as deletePlaylist } from "./features/playlists/delete-playlist/handler";
export type { DeletePlaylistInput, DeletePlaylistResult } from "./features/playlists/delete-playlist/types";
export { duplicatePlaylistHandler as duplicatePlaylist } from "./features/playlists/duplicate-playlist/handler";
export type { DuplicatePlaylistInput, DuplicatePlaylistResult } from "./features/playlists/duplicate-playlist/types";
export { scanPlaylistFolderHandler as scanPlaylistFolder } from "./features/playlists/scan-playlist-folder/handler";
// Saúde da pasta compartilhada de vídeos — selo na aba Playlists.
export { inspectVideosFolderHandler as inspectVideosFolder } from "./features/playlists/inspect-videos-folder/handler";
export type { InspectVideosFolderResult, VideosFolderHealth } from "./features/playlists/inspect-videos-folder/types";
// Sem authorizeActor (ver o próprio handler) — só a rota de stream (app/api/broadcast/stream)
// chama isto, nunca uma action de UI autenticada por sessão de admin.
export {
  resolveStreamableItemHandler as resolveStreamableItem,
} from "./features/playlists/resolve-streamable-playlist-item/handler";

export type { CreatePlaylistInput, CreatePlaylistResult } from "./features/playlists/create-playlist/types";
export type { ListPlaylistsResult } from "./features/playlists/list-playlists/types";
export type {
  ListPlaylistItemsQuery,
  ListPlaylistItemsResult,
} from "./features/playlists/list-playlist-items/types";
export type {
  AddMediaAssetPlaylistItemInput,
  AddMediaAssetPlaylistItemResult,
} from "./features/playlists/add-media-asset-playlist-item/types";
export type {
  DeletePlaylistItemInput,
  DeletePlaylistItemResult,
} from "./features/playlists/delete-playlist-item/types";
export {
  addWebpagePlaylistItemHandler as addWebpagePlaylistItem,
} from "./features/playlists/add-webpage-playlist-item/handler";
export type {
  AddWebpagePlaylistItemInput,
  AddWebpagePlaylistItemResult,
} from "./features/playlists/add-webpage-playlist-item/types";
// Sonda best-effort "este site carrega dentro de um iframe na TV?" — só aviso antecipado, não
// bloqueia adicionar. Ver features/playlists/check-webpage-embeddable.
export {
  checkWebpageEmbeddableHandler as checkWebpageEmbeddable,
} from "./features/playlists/check-webpage-embeddable/handler";
export type {
  CheckWebpageEmbeddableInput,
  CheckWebpageEmbeddableResult,
  WebpageEmbeddable,
} from "./features/playlists/check-webpage-embeddable/types";
// Atalho "Painel de métricas" — só funciona com o plugin company-metrics ativo (§9.3).
export {
  addMetricsBoardPlaylistItemHandler as addMetricsBoardPlaylistItem,
} from "./features/playlists/add-metrics-board-playlist-item/handler";
export type {
  AddMetricsBoardPlaylistItemInput,
  AddMetricsBoardPlaylistItemResult,
} from "./features/playlists/add-metrics-board-playlist-item/types";
export {
  addNewsPlaylistItemHandler as addNewsPlaylistItem,
} from "./features/playlists/add-news-playlist-item/handler";
export type {
  AddNewsPlaylistItemInput,
  AddNewsPlaylistItemResult,
} from "./features/playlists/add-news-playlist-item/types";
export {
  addAgendaEventPlaylistItemHandler as addAgendaEventPlaylistItem,
} from "./features/playlists/add-agenda-event-playlist-item/handler";
export type {
  AddAgendaEventPlaylistItemInput,
  AddAgendaEventPlaylistItemResult,
} from "./features/playlists/add-agenda-event-playlist-item/types";
export {
  updatePlaylistItemHandler as updatePlaylistItem,
} from "./features/playlists/update-playlist-item/handler";
export type {
  UpdatePlaylistItemInput,
  UpdatePlaylistItemResult,
} from "./features/playlists/update-playlist-item/types";
export {
  reorderPlaylistItemsHandler as reorderPlaylistItems,
} from "./features/playlists/reorder-playlist-items/handler";
export type {
  ReorderPlaylistItemsInput,
  ReorderPlaylistItemsResult,
} from "./features/playlists/reorder-playlist-items/types";
export {
  addScannedPlaylistItemsHandler as addScannedPlaylistItems,
} from "./features/playlists/add-scanned-playlist-items/handler";
export type {
  AddScannedPlaylistItemsInput,
  AddScannedPlaylistItemsResult,
} from "./features/playlists/add-scanned-playlist-items/types";
// Upload de vídeo pra pasta compartilhada — chamado só pela rota app/api/broadcast/upload (o
// arquivo já está no disco quando isto roda; ver features/playlists/upload-local-video e
// runtime/upload-storage). Gate: broadcast.manage OU broadcast.playlists.manage + atribuição.
export { uploadLocalVideoHandler as uploadLocalVideo } from "./features/playlists/upload-local-video/handler";
export type { UploadLocalVideoInput, UploadLocalVideoResult } from "./features/playlists/upload-local-video/types";
export {
  togglePlaylistItemVisibilityHandler as togglePlaylistItemVisibility,
} from "./features/playlists/toggle-playlist-item-visibility/handler";
export type {
  TogglePlaylistItemVisibilityInput,
  TogglePlaylistItemVisibilityResult,
} from "./features/playlists/toggle-playlist-item-visibility/types";
export type {
  ScanPlaylistFolderInput,
  ScanPlaylistFolderResult,
  ScanPlaylistFolderPreview,
  ScanPlaylistFolderMissingItem,
} from "./features/playlists/scan-playlist-folder/types";
export type {
  ResolveStreamableItem,
  ResolveStreamableItemQuery,
  ResolveStreamableItemResult,
} from "./features/playlists/resolve-streamable-playlist-item/types";

// "Responsável" por uma playlist — mesmo racional/padrão de setAgendaEditors/setOutputEditors
// (paridade pedida explicitamente: "Superadmin pode definir quem são os administradores de telas,
// playlists e agendas"). Só broadcast.manage decide quem é.
export { setPlaylistEditorsHandler as setPlaylistEditors } from "./features/playlists/set-playlist-editors/handler";
export { listPlaylistEditorsHandler as listPlaylistEditors } from "./features/playlists/list-playlist-editors/handler";
export type { SetPlaylistEditorsInput, SetPlaylistEditorsResult } from "./features/playlists/set-playlist-editors/types";
export type { ListPlaylistEditorsResult } from "./features/playlists/list-playlist-editors/types";

// Só pra app/api/broadcast/stream (Range request parsing) — a rota nunca importa de dentro de
// ./shared diretamente, sempre pelo barrel, mesmo padrão de outras rotas de plugin (ver
// app/api/birthdays/import-template/route.ts).
export { parseRangeHeader } from "./shared/range-header";

// create/update/delete de cena e camada não são mais expostos (pedido explícito: "não vamos
// precisar configurar manualmente as camadas, você já define isso") — toda saída nasce com sua
// cena padrão de 3 camadas fixas (vídeo/agenda/aviso) já provisionada, ver create-output/store.ts.
// list-scenes/list-layers continuam existindo só pra leitura (page.tsx resolve qual playlist cada
// saída está tocando a partir da camada de vídeo da sua cena).
export { listScenesHandler as listScenes } from "./features/scenes/list-scenes/handler";
export type { ListScenesResult } from "./features/scenes/list-scenes/types";

export { listLayersHandler as listLayers } from "./features/layers/list-layers/handler";
export type { ListLayersQuery, ListLayersResult } from "./features/layers/list-layers/types";

export { createOutputHandler as createOutput } from "./features/outputs/create-output/handler";
export { listOutputsHandler as listOutputs } from "./features/outputs/list-outputs/handler";
export { setOutputPlaylistHandler as setOutputPlaylist } from "./features/outputs/set-output-playlist/handler";
// drawerOpen agora significa "a coluna de agenda está aberta" (ver layer-renderer.tsx) — o nome do
// campo/handler ficou de propósito, só o significado mudou.
export { setOutputDrawerHandler as setOutputDrawer } from "./features/outputs/set-output-drawer/handler";
export { setOutputFooterHandler as setOutputFooter } from "./features/outputs/set-output-footer/handler";
export { setOutputTickerHandler as setOutputTicker } from "./features/outputs/set-output-ticker/handler";
// Tela de espera branded ligada de propósito pelo admin (Fase 11) — mesmo authorizeOutputActor de
// setOutputDrawer/setOutputFooter; o service publica "offline-changed" via SSE.
export { setOutputOfflineHandler as setOutputOffline } from "./features/outputs/set-output-offline/handler";
// Ciclo fixo de abrir/pausar a coluna lateral (janela aberta + janela de pausa, ver
// database/schema/index.ts) — ver shared/scoped-authorization (mesmo authorizeOutputActor de
// setOutputDrawer/setOutputFooter) e o scheduler client em output-canvas.tsx.
export { setOutputAgendaScheduleHandler as setOutputAgendaSchedule } from "./features/outputs/set-output-agenda-schedule/handler";
// Fallback de conteúdo (imagem/vídeo + mensagem) e horário de funcionamento da tela — mesmo
// authorizeOutputActor dos outros controles; publicam "settings-changed" (a TV re-resolve).
export { setOutputFallbackHandler as setOutputFallback } from "./features/outputs/set-output-fallback/handler";
export type { SetOutputFallbackInput, SetOutputFallbackResult } from "./features/outputs/set-output-fallback/types";
export { setOutputHoursHandler as setOutputHours } from "./features/outputs/set-output-hours/handler";
export type { SetOutputHoursInput, SetOutputHoursResult } from "./features/outputs/set-output-hours/types";
export { setOutputPinHandler as setOutputPin } from "./features/outputs/set-output-pin/handler";
// Zera o limitador de tentativas de PIN (brute force) de uma saída — gate igual ao de
// setOutputPin (broadcast.manage OU broadcast.outputs.manage + atribuição). Contador em memória
// (runtime/pin-attempts.ts), sem I/O além de resolver o token da saída.
export { resetOutputPinAttemptsHandler as resetOutputPinAttempts } from "./features/outputs/reset-output-pin-attempts/handler";
export type {
  ResetOutputPinAttemptsInput,
  ResetOutputPinAttemptsResult,
} from "./features/outputs/reset-output-pin-attempts/types";
// Sem authorizeActor (ver o próprio handler) — acesso por token, mesmo espírito de getOutputState
// logo abaixo: chamado pela página de saída e pelas rotas de API (state/events), nunca por uma
// action de UI autenticada por sessão de admin.
export { verifyOutputPinHandler as verifyOutputPin } from "./features/outputs/verify-output-pin/handler";
export { deleteOutputHandler as deleteOutput } from "./features/outputs/delete-output/handler";
export type { DeleteOutputInput, DeleteOutputResult } from "./features/outputs/delete-output/types";
export { duplicateOutputHandler as duplicateOutput } from "./features/outputs/duplicate-output/handler";
export type { DuplicateOutputInput, DuplicateOutputResult } from "./features/outputs/duplicate-output/types";
// "Responsável" por uma saída — só broadcast.manage decide quem é (mesmo racional de
// set-agenda-editors, ver shared/scoped-authorization/index.ts).
export { setOutputEditorsHandler as setOutputEditors } from "./features/outputs/set-output-editors/handler";
export { listOutputEditorsHandler as listOutputEditors } from "./features/outputs/list-output-editors/handler";
export type { SetOutputEditorsInput, SetOutputEditorsResult } from "./features/outputs/set-output-editors/types";
export type { ListOutputEditorsResult } from "./features/outputs/list-output-editors/types";
// "Delegar a tela inteira" — atribui/remove uma pessoa como responsável da tela + playlist(s) que
// ela toca + agenda(s) vinculadas, numa ação só (gate broadcast.manage). Ajuste fino por recurso
// continua nos set-*-editors acima.
export { delegateOutputHandler as delegateOutput } from "./features/outputs/delegate-output/handler";
export type { DelegateOutputInput, DelegateOutputResult, DelegateOutputMode } from "./features/outputs/delegate-output/types";
// Manda a(s) TV(s) desta tela recarregarem (evento SSE "reload") — gate igual aos outros
// controles ao vivo (broadcast.manage OU broadcast.outputs.manage + atribuição).
export { reloadOutputHandler as reloadOutput } from "./features/outputs/reload-output/handler";
export type { ReloadOutputInput, ReloadOutputResult } from "./features/outputs/reload-output/types";
// Gera um token novo pra tela (o link antigo morre). Mesmo gate dos controles ao vivo.
export { rotateOutputTokenHandler as rotateOutputToken } from "./features/outputs/rotate-output-token/handler";
export type { RotateOutputTokenInput, RotateOutputTokenResult } from "./features/outputs/rotate-output-token/types";
// Sem authorizeActor (ver o próprio handler) — acesso por token, chamado pela página de saída
// (server component) e pela rota SSE, nunca por uma action de UI autenticada por sessão de admin.
export { getOutputStateHandler as getOutputState } from "./features/outputs/get-output-state/handler";
// IPs das TVs conectadas agora (por token) — gateado por broadcast.manage, ver o handler. Consome
// o Map em memória de runtime/output-bus; usado pelo poll do admin em outputs-section.tsx.
export { listConnectedOutputIpsHandler as listConnectedOutputIps } from "./features/outputs/list-connected-output-ips/handler";
export type { ListConnectedOutputIpsResult } from "./features/outputs/list-connected-output-ips/types";
// Tokens com bloqueio de tentativa de PIN ativo agora — mesmo poll/gate do de IPs conectados.
export { listOutputPinBlocksHandler as listOutputPinBlocks } from "./features/outputs/list-output-pin-blocks/handler";
export type { ListOutputPinBlocksResult } from "./features/outputs/list-output-pin-blocks/types";
// Telemetria das TVs (viewport/navegador/status/uptime), reportada via beacon — mesmo poll/gate.
export { listOutputTelemetryHandler as listOutputTelemetry } from "./features/outputs/list-output-telemetry/handler";
export type { ListOutputTelemetryResult } from "./features/outputs/list-output-telemetry/types";
export type { OutputBeaconSummary } from "./runtime/output-beacon";
// Dayparting — programação de playlist por horário/dia da semana, por tela. get-output-state lê os
// slots direto do store dele; estes são pro admin (set = editar, list = loader da página).
export { setOutputPlaylistScheduleHandler as setOutputPlaylistSchedule } from "./features/outputs/set-output-playlist-schedule/handler";
export { listOutputPlaylistSchedulesHandler as listOutputPlaylistSchedules } from "./features/outputs/list-output-playlist-schedules/handler";
export type {
  SetOutputPlaylistScheduleInput,
  SetOutputPlaylistScheduleResult,
  OutputPlaylistScheduleSlotInput,
} from "./features/outputs/set-output-playlist-schedule/types";
export type { ListOutputPlaylistSchedulesResult } from "./features/outputs/list-output-playlist-schedules/types";
export type { BroadcastPlaylistScheduleSlot } from "./contracts/types";

export type { CreateOutputInput, CreateOutputResult, OutputTemplate } from "./features/outputs/create-output/types";
export { OUTPUT_TEMPLATES } from "./features/outputs/create-output/types";
export type { ListOutputsResult } from "./features/outputs/list-outputs/types";
export type { SetOutputPlaylistInput, SetOutputPlaylistResult } from "./features/outputs/set-output-playlist/types";
export type { SetOutputDrawerInput, SetOutputDrawerResult } from "./features/outputs/set-output-drawer/types";
export type { SetOutputFooterInput, SetOutputFooterResult } from "./features/outputs/set-output-footer/types";
export type { SetOutputTickerInput, SetOutputTickerResult } from "./features/outputs/set-output-ticker/types";
export type { SetOutputOfflineInput, SetOutputOfflineResult } from "./features/outputs/set-output-offline/types";
export type {
  SetOutputAgendaScheduleInput,
  SetOutputAgendaScheduleResult,
} from "./features/outputs/set-output-agenda-schedule/types";
export type { SetOutputPinInput, SetOutputPinResult } from "./features/outputs/set-output-pin/types";
export type { VerifyOutputPinQuery, VerifyOutputPinResult } from "./features/outputs/verify-output-pin/types";
export type {
  AgendaRotationEntry,
  AgendaRotationEvent,
  BroadcastOutputState,
  GetOutputStateQuery,
  GetOutputStateResult,
  PlaylistItemSummary,
} from "./features/outputs/get-output-state/types";

// Só pra view de saída (Fase 4/5) calcular a geometria efetiva de uma layer quando a drawer está
// aberta — a rota nunca importa de dentro de ./shared diretamente (mesmo padrão de
// parseRangeHeader acima).
export { resolveLayerGeometry } from "./shared/layer-geometry";
export type { LayerGeometry } from "./shared/layer-geometry";

export type { BroadcastOutputEvent } from "./contracts/types";
// Infra de runtime (pub/sub em memória, não uma feature — ver runtime/output-bus.ts).
// subscribeToOutputEvents é só pra app/api/broadcast/output/[token]/events (SSE) se inscrever,
// nunca chamado de uma action de UI. A leitura oposta (quais IPs estão com a tela aberta agora, só
// pra admin) NÃO é exposta crua aqui — passa pelo handler list-connected-output-ips abaixo, que
// aplica authorizeActor("broadcast.manage").
export { subscribeToOutputEvents } from "./runtime/output-bus";

export { createAgendaHandler as createAgenda } from "./features/agenda/create-agenda/handler";
export { updateAgendaHandler as updateAgenda } from "./features/agenda/update-agenda/handler";
export { reorderAgendasHandler as reorderAgendas } from "./features/agenda/reorder-agendas/handler";
export { listAgendasHandler as listAgendas } from "./features/agenda/list-agendas/handler";
export { deleteAgendaHandler as deleteAgenda } from "./features/agenda/delete-agenda/handler";
export { createAgendaEventHandler as createAgendaEvent } from "./features/agenda/create-agenda-event/handler";
export { updateAgendaEventHandler as updateAgendaEvent } from "./features/agenda/update-agenda-event/handler";
export { listAgendaEventsHandler as listAgendaEvents } from "./features/agenda/list-agenda-events/handler";
export { deleteAgendaEventHandler as deleteAgendaEvent } from "./features/agenda/delete-agenda-event/handler";
// Vínculo agenda↔saída — só broadcast.manage (não broadcast.agenda.manage: escolher em quais
// telas uma agenda aparece é decisão de quem administra as saídas, não do editor de conteúdo).
export { setAgendaOutputsHandler as setAgendaOutputs } from "./features/agenda/set-agenda-outputs/handler";
export { listAgendaOutputsHandler as listAgendaOutputs } from "./features/agenda/list-agenda-outputs/handler";
// "Responsável" por uma agenda — pedido explícito: "adicionar um responsável (role editor pra
// cima) com acesso e permissão para alterar apenas a agenda atribuída". Só broadcast.manage decide
// quem é (ver shared/scoped-authorization/index.ts pro racional completo).
export { setAgendaEditorsHandler as setAgendaEditors } from "./features/agenda/set-agenda-editors/handler";
export { listAgendaEditorsHandler as listAgendaEditors } from "./features/agenda/list-agenda-editors/handler";

export type { CreateAgendaInput, CreateAgendaResult } from "./features/agenda/create-agenda/types";
export type { UpdateAgendaInput, UpdateAgendaResult } from "./features/agenda/update-agenda/types";
export type { ReorderAgendasInput, ReorderAgendasResult } from "./features/agenda/reorder-agendas/types";
export type { ListAgendasResult } from "./features/agenda/list-agendas/types";
export type { SetAgendaOutputsInput, SetAgendaOutputsResult } from "./features/agenda/set-agenda-outputs/types";
export type { ListAgendaOutputsResult } from "./features/agenda/list-agenda-outputs/types";
export type { SetAgendaEditorsInput, SetAgendaEditorsResult } from "./features/agenda/set-agenda-editors/types";
export type { ListAgendaEditorsResult } from "./features/agenda/list-agenda-editors/types";
export type { DeleteAgendaInput, DeleteAgendaResult } from "./features/agenda/delete-agenda/types";
export type { CreateAgendaEventInput, CreateAgendaEventResult } from "./features/agenda/create-agenda-event/types";
export type { UpdateAgendaEventInput, UpdateAgendaEventResult } from "./features/agenda/update-agenda-event/types";
export type { ListAgendaEventsResult } from "./features/agenda/list-agenda-events/types";
export type { DeleteAgendaEventInput, DeleteAgendaEventResult } from "./features/agenda/delete-agenda-event/types";

export { publishAlertHandler as publishAlert } from "./features/alerts/publish-alert/handler";
export { clearAlertHandler as clearAlert } from "./features/alerts/clear-alert/handler";
export type { PublishAlertInput, PublishAlertResult } from "./features/alerts/publish-alert/types";
export type { ClearAlertResult } from "./features/alerts/clear-alert/types";

export type {
  BroadcastAgendaRecord,
  BroadcastAgendaEventRecord,
  BroadcastAgendaEventDate,
  BroadcastAlertRecord,
  PlaylistItemKind,
  RegionNewsArticle,
  RegionWeather,
} from "./contracts/types";
