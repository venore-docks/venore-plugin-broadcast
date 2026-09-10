import { sql } from "drizzle-orm";
import { type AnyPgColumn, boolean, check, index, integer, jsonb, pgSchema, primaryKey, real, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const broadcastSchema = pgSchema("broadcast");

export const broadcastScenes = broadcastSchema.table(
  "scenes",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    key: text("key").notNull(),
    name: text("name").notNull(),
    order: integer("order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("broadcast_scenes_key_idx").on(table.key)],
);

// x/y/width/height guardados como percentual (real, 0-100), não pixel — ver contracts/types.ts.
// config (jsonb) carrega o payload específico de cada type ("text" guarda a string, etc.) —
// schema livre de propósito, cada layer type interpreta o próprio formato dentro de service.ts,
// não no banco.
//
// Lista de tipos simplificada (era video/text/clock/lower-third/image/custom-html): "clock" virou
// "info" (relógio + clima, mesmo tipo, mais informação, zero campo extra pro operador);
// "lower-third"/"custom-html" foram removidos por serem redundantes com "text" + um preset de
// posição — feedback direto do usuário pedindo menos opções. "news"/"agenda" são novos, também
// sem nenhum campo manual (resolvidos a partir de broadcast.region e da agenda interna).
export const broadcastLayers = broadcastSchema.table(
  "layers",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    sceneId: text("scene_id")
      .notNull()
      .references(() => broadcastScenes.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    name: text("name").notNull(),
    x: real("x").notNull().default(0),
    y: real("y").notNull().default(0),
    width: real("width").notNull().default(100),
    height: real("height").notNull().default(100),
    zIndex: integer("z_index").notNull().default(0),
    config: jsonb("config").notNull().default({}),
    visible: boolean("visible").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("broadcast_layers_type_check", sql`${table.type} in ('video','text','image','info','news','agenda','alert')`),
  ],
);

// folderPath é relativo à raiz configurada em contexts/settings (broadcast.rootFolder), nunca um
// path absoluto vindo de fora — o scan (Fase 2) resolve e valida contra a raiz antes de gravar.
export const broadcastPlaylists = broadcastSchema.table("playlists", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  folderPath: text("folder_path"),
  // Playlist dedicada a UMA tela (modelo 1:1 — pedido explícito: "criar playlist dedicada por
  // tela", em vez de uma playlist compartilhada por várias telas). Preenchido quando a playlist
  // nasce junto com a saída (create-output/store.ts); null pra playlist "compartilhada" criada à
  // mão em /admin/broadcast — o comportamento anterior continua suportado, tanto pra instalações
  // que já tinham telas apontando pra playlists compartilhadas quanto pra quem, de propósito,
  // aponta várias telas pra mesma playlist depois (setOutputPlaylist). FK real (mesmo plugin).
  // onDelete "set null" é só rede de segurança: delete-output/store.ts resolve o id da playlist
  // dedicada ANTES de apagar a tela e apaga as duas na mesma transação (o set null zeraria a
  // coluna antes de dar pra achar a playlist por owner_output_id).
  // Anotação AnyPgColumn quebra o ciclo de inferência do tsc: playlists.ownerOutputId -> outputs,
  // e outputs.currentPlaylistItemId -> playlist_items -> playlists (fecha o laço). Sem o tipo
  // explícito, tsc não consegue inferir o tipo de nenhuma das três tabelas (TS7022/TS7024).
  ownerOutputId: text("owner_output_id").references((): AnyPgColumn => broadcastOutputs.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// mediaAssetId é texto solto, sem FK pra media.assets: um plugin não pode importar
// contexts/media/database/schema (regra 7/8 do AGENTS.md — vale pra leitura e escrita). Resolução
// de URL/metadata de um item "media-asset" sempre passa por @/contexts/media (getMediaAsset).
//
// "kind" (vídeo/imagem/site) não é uma coluna própria — é derivado em get-output-state a partir da
// extensão (local) ou do contentType (media-asset); só "webpage" é inequívoco pelo sourceType.
// Isso evita uma terceira fonte de verdade sobre o tipo do arquivo (extensão/contentType já são a
// fonte real). durationSeconds é usado só quando o item resolve pra "imagem" ou é "webpage" —
// vídeo usa a duração natural do próprio arquivo (onEnded).
export const broadcastPlaylistItems = broadcastSchema.table(
  "playlist_items",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    playlistId: text("playlist_id")
      .notNull()
      .references(() => broadcastPlaylists.id, { onDelete: "cascade" }),
    order: integer("order").notNull().default(0),
    title: text("title"),
    sourceType: text("source_type").notNull(),
    relativePath: text("relative_path"),
    mediaAssetId: text("media_asset_id"),
    url: text("url"),
    // Só preenchido quando sourceType = "agenda-event" — FK de verdade (diferente de mediaAssetId
    // acima): broadcastAgendaEvents é do MESMO plugin, então referenciar direto não viola a regra
    // 7/8 do AGENTS.md (que só proíbe cruzar pra dentro de OUTRO context/plugin). Cascade: apagar o
    // evento apaga o item da playlist que o exibia (não faz sentido um card "em destaque" sobreviver
    // ao evento que ele mostra).
    agendaEventId: text("agenda_event_id").references(() => broadcastAgendaEvents.id, { onDelete: "cascade" }),
    durationSeconds: real("duration_seconds"),
    hidden: boolean("hidden").notNull().default(false),
    // Só tem efeito em item de vídeo (local/media-asset que resolve pra vídeo) e "webpage": quando
    // false (default), o <video> da view sai `muted` (exigência de autoplay do navegador) e o
    // <iframe> não recebe `allow="autoplay"`. Quando true, o vídeo toca com som e o iframe ganha a
    // permissão — só funciona de fato num navegador de TV/kiosk configurado pra permitir autoplay
    // com som (ex: Chrome `--autoplay-policy=no-user-gesture-required`); se o navegador bloquear, o
    // vídeo cai pra reprodução muda pra não travar a playlist (ver layer-renderer.tsx).
    withAudio: boolean("with_audio").notNull().default(false),
    // Janela de validade opcional — o item só entra na reprodução da TV entre visible_from e
    // visible_until. Ambos null (padrão) = sempre visível; pedido explícito: "este vídeo de fim de
    // ano só aparece até 25/12". Timestamp completo, hora de parede da instituição convertida pra
    // UTC no admin (mesmo tratamento de startAt de evento de agenda). O item NÃO é apagado fora da
    // janela — só some da reprodução, igual ao `hidden`. Filtro em get-output-state/store.ts
    // (findVisiblePlaylistItemsByPlaylistId).
    visibleFrom: timestamp("visible_from", { withTimezone: true }),
    visibleUntil: timestamp("visible_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "broadcast_playlist_items_source_type_check",
      sql`${table.sourceType} in ('local','media-asset','webpage','news','agenda-event')`,
    ),
    // Exatamente um de relativePath/mediaAssetId/url/agendaEventId preenchido, de acordo com
    // sourceType — impede linha ambígua ou órfã direto no banco. "news" não referencia arquivo/URL
    // nenhum: é um marcador de posição no rodízio da playlist, os artigos vêm de
    // runtime/region-news.ts (mesma fonte da layer "news" standalone) — durationSeconds aqui é o
    // teto do bloco inteiro (todas as manchetes juntas), não por manchete. "agenda-event" referencia
    // um único evento (agendaEventId) — pedido explícito: "não quero que entre a agenda, apenas um
    // item da agenda, com todas as informações".
    check(
      "broadcast_playlist_items_source_shape_check",
      sql`(${table.sourceType} = 'local' AND ${table.relativePath} IS NOT NULL AND ${table.mediaAssetId} IS NULL AND ${table.url} IS NULL AND ${table.agendaEventId} IS NULL)
        OR (${table.sourceType} = 'media-asset' AND ${table.mediaAssetId} IS NOT NULL AND ${table.relativePath} IS NULL AND ${table.url} IS NULL AND ${table.agendaEventId} IS NULL)
        OR (${table.sourceType} = 'webpage' AND ${table.url} IS NOT NULL AND ${table.relativePath} IS NULL AND ${table.mediaAssetId} IS NULL AND ${table.agendaEventId} IS NULL)
        OR (${table.sourceType} = 'news' AND ${table.relativePath} IS NULL AND ${table.mediaAssetId} IS NULL AND ${table.url} IS NULL AND ${table.agendaEventId} IS NULL)
        OR (${table.sourceType} = 'agenda-event' AND ${table.agendaEventId} IS NOT NULL AND ${table.relativePath} IS NULL AND ${table.mediaAssetId} IS NULL AND ${table.url} IS NULL)`,
    ),
  ],
);

// Agenda interna do plugin — vira múltiplas agendas nomeadas (2ª rodada: "quero poder criar
// agendas que vão ficar rodando aqui" — semanal, mensal, da faculdade, do colégio...) que a layer
// "agenda" alterna, cada uma ficando `displaySeconds` na tela antes de trocar pra próxima. Não é
// um calendário genérico reaproveitável por outro context/plugin — vive só aqui de propósito.
// backgroundColor é hex (#rrggbb), escolhido pelo operador via <input type="color"> — null cai no
// preto padrão do painel (mesmo racional de layers.config.color na layer "text": cor por instância
// escolhida em runtime, não um token de design fixo no código). logoMediaAssetId (texto solto, sem
// FK — mesmo racional de playlist_items.mediaAssetId, ver comentário abaixo) deixa cada agenda ter
// sua própria marca; null cai na logo padrão da plataforma (brandLogoUrl, resolvido via
// getBrandConfig em get-output-state).
export const broadcastAgendas = broadcastSchema.table("agendas", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text("name").notNull(),
  displaySeconds: integer("display_seconds").notNull().default(20),
  order: integer("order").notNull().default(0),
  backgroundColor: text("background_color"),
  logoMediaAssetId: text("logo_media_asset_id"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Eventos simples (título + data, descrição opcional) — sempre pertencem a uma agenda nomeada
// (broadcastAgendas), nunca soltos. coverMediaAssetId (opcional) é texto solto sem FK — mesmo
// racional de playlist_items.mediaAssetId: um plugin não pode importar
// contexts/media/database/schema (regra 7/8 do AGENTS.md), resolução de URL sempre passa por
// @/contexts/media (getMediaAsset). Sem cover, o card do evento renderiza igual a antes.
//
// recurring: sem convidados, sem regra genérica de recorrência (RRULE completo, intervalo,
// "até tal data", exceções) — só o caso pedido: "toda semana, sempre" — pedido explícito: "quero
// criar um evento que acontece toda semana... não quero ter que ficar trocando a data toda
// semana. Quero que mostre a data da quarta próxima". startAt vira a ÂNCORA do padrão quando
// recurring=true (o dia da semana e o horário dele definem a recorrência, não a data em si) — a
// data real da PRÓXIMA ocorrência é sempre calculada em runtime a partir de "agora", nunca gravada
// (ver shared/weekly-recurrence.ts); editar o evento reancora o padrão a partir do que foi salvo.
export const broadcastAgendaEvents = broadcastSchema.table("agenda_events", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  agendaId: text("agenda_id")
    .notNull()
    .references(() => broadcastAgendas.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  description: text("description"),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  recurring: boolean("recurring").notNull().default(false),
  // Timestamp completo (não só hora) — pode ser em qualquer data posterior ao início, inclusive
  // dias depois (pedido explícito: "o término pode acontecer em qualquer data posterior... pode
  // haver eventos que duram dias"; antes era só uma hora sem data, limitado a "termina no mesmo
  // dia ou no dia seguinte"). Opcional; usado só pra exibição ("19:30–21:00" ou "12/03 09:00 –
  // 14/03 18:00"), nunca em filtro/expiração — diferente de broadcastAlerts.expiresAt. Pra evento
  // recorrente (recurring=true), isso também é só uma ÂNCORA (mesmo racional de startAt) — o que
  // se repete toda semana é a DURAÇÃO (endAt - startAt), não a data do término em si; ver
  // shared/weekly-recurrence.ts (resolveEventEndDate).
  endAt: timestamp("end_at", { withTimezone: true }),
  coverMediaAssetId: text("cover_media_asset_id"),
  // Local/sala do evento — texto livre, opcional, só exibição (nenhum filtro/agrupamento depende
  // disso). Pedido explícito: "aumentar o tamanho das informações nos cards de eventos e
  // acrescentar o local (informação de sala, etc)".
  location: text("location"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Datas EXTRAS de um evento não recorrente — pedido explícito: "um evento que acontece em dois
// dias NÃO consecutivos (ex: dia 10 e dia 15)". O evento continua UM card (broadcastAgendaEvents);
// esta tabela só acrescenta ocorrências avulsas à data primária (startAt/endAt do próprio evento).
// Cada data extra tem início e término PRÓPRIOS — mesma semântica de startAt/endAt do evento
// (endAt opcional, timestamp completo, só exibição). NÃO se aplica a evento recurring=true: o
// service persiste zero linhas aqui quando recurring, e a seção fica escondida no admin. onDelete
// cascade: apagar o evento apaga suas datas extras. Sem created_at/updated_at de propósito — é
// dado auxiliar, sempre lido/gravado junto com o evento pai, nunca versionado sozinho.
export const broadcastAgendaEventDates = broadcastSchema.table("agenda_event_dates", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  eventId: text("event_id")
    .notNull()
    .references(() => broadcastAgendaEvents.id, { onDelete: "cascade" }),
  startAt: timestamp("start_at", { withTimezone: true }).notNull(),
  endAt: timestamp("end_at", { withTimezone: true }),
});

// Aviso rápido (lower-third/alerta) — no máximo um "ativo" por vez (o mais recente com expiresAt
// no futuro). Criado com uma duração; expira sozinho, sem precisar de ação manual pra sumir. Lido
// pela layer "alert", que ignora a geometria configurada e sempre sobrepõe tudo quando há um
// aviso ativo (pedido explícito: "quando não houver não aparece, quando houver sobrepõe tudo").
// target: null = todas as telas (comportamento original). "group:<nome>" = só as telas desse
// grupo. "output:<id>" = só uma tela. Resolvido em get-output-state por saída — o SSE continua
// avisando todo mundo (cada TV re-busca o estado e decide se o alerta é pra ela).
export const broadcastAlerts = broadcastSchema.table("alerts", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  message: text("message").notNull(),
  target: text("target"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Uma linha por "saída" (URL exibida na TV). token é o único mecanismo de acesso à view de saída
// (sem sessão/RBAC — ver contracts/types.ts) — gerado em create-output/store.ts como um slug do
// nome (curto, fácil de digitar num controle remoto de TV), não mais um UUID; o $defaultFn aqui é
// só uma rede de segurança caso algum insert futuro esqueça de passar token explicitamente.
export const broadcastOutputs = broadcastSchema.table(
  "outputs",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    name: text("name").notNull(),
    token: text("token")
      .notNull()
      .$defaultFn(() => crypto.randomUUID()),
    currentSceneId: text("current_scene_id").references(() => broadcastScenes.id, { onDelete: "set null" }),
    currentPlaylistItemId: text("current_playlist_item_id").references(() => broadcastPlaylistItems.id, {
      onDelete: "set null",
    }),
    drawerOpen: boolean("drawer_open").notNull().default(false),
    // Mesmo mecanismo de drawerOpen, pra BrandFooterBar (logo+relógio+data+temperatura) — default
    // true (comportamento anterior era sempre mostrar a barra).
    footerOpen: boolean("footer_open").notNull().default(true),
    // Tela de espera branded ligada de propósito pelo admin (Fase 11) — quando true, a view mostra
    // a StandbyScreen (marca do site + animação calma + texto de status) no lugar do conteúdo,
    // mesmo com playlist/cena configuradas. Independente de drawerOpen/footerOpen. default false
    // (comportamento anterior: a saída está sempre no ar). O outro caminho pra StandbyScreen —
    // tela sem conteúdo resolvível, ou sem contato com o servidor — é 100% client-side, não passa
    // por esta coluna (ver components/output/output-canvas.tsx).
    offline: boolean("offline").notNull().default(false),
    // Ticker de agenda no rodapé (texto rolando com os próximos eventos) — opt-in, desligado por
    // padrão (pedido explícito: "esse componente deve ser desligado por padrão, ligado apenas
    // quando eu quiser colocar"). Independente de drawerOpen: mostra dado de agenda mesmo com a
    // coluna lateral fechada (ver needsAgenda em get-output-state/service.ts).
    tickerEnabled: boolean("ticker_enabled").notNull().default(false),
    // Ciclo fixo de abrir/pausar a coluna lateral — pedido explícito: "quero escolher quando essa
    // pausa acontece [...] deixar a agenda aberta por uns 3 min, depois 1 min de pausa" (correção
    // de uma 1ª versão que pausava depois de CADA agenda individual, ligada a agendas.
    // display_seconds — o operador não conseguia controlar quando a pausa de fato acontecia).
    // agendaOpenSeconds é quanto tempo a coluna fica aberta (o rodízio interno entre agendas roda
    // livre por dentro dessa janela, sem relação nenhuma com o número de agendas ou o
    // displaySeconds de cada uma); agendaPauseSeconds é quanto tempo fica fechada (só vídeo+
    // rodapé aparecem) antes de reabrir. Os dois precisam estar preenchidos (>0) pro ciclo ligar —
    // qualquer um null/0 desliga o ciclo inteiro, volta ao rodízio contínuo sem pausa (comportamento
    // original) — ver set-output-agenda-schedule/service.ts (valida o par) e o scheduler client em
    // output-canvas.tsx.
    agendaOpenSeconds: integer("agenda_open_seconds"),
    agendaPauseSeconds: integer("agenda_pause_seconds"),
    // PIN opcional pra acessar a view pública desta saída. Guardado como hash `scrypt$salt$hash`
    // (ver shared/pin-hash.ts, set-output-pin grava, verify-output-pin confere) — PINs em texto
    // plano gravados antes da Fase 9 ainda funcionam e viram hash no primeiro acerto (re-hash
    // preguiçoso em routes/out/actions.ts). null = sem proteção, comportamento anterior inalterado.
    // Continua `text` (hash é texto) — nenhuma migração estrutural na Fase 9.
    pin: text("pin"),
    // Fallback de conteúdo desta tela: quando a playlist não resolve nada tocável (vazia, arquivos
    // sumidos, tudo fora da janela de validade), a view mostra ISTO no lugar da tela de espera
    // genérica. fallbackMediaAssetId = imagem/vídeo da biblioteca (id cru, sem FK — resolução via
    // @/contexts/media em get-output-state); fallbackMessage = texto livre. Os dois null = tela de
    // espera branded padrão (comportamento anterior).
    fallbackMediaAssetId: text("fallback_media_asset_id"),
    fallbackMessage: text("fallback_message"),
    // Horário de funcionamento — FORA da janela, a tela entra em modo espera automaticamente (a
    // view mostra a StandbyScreen). Reaproveita o vocabulário de shared/playlist-schedule.ts:
    // active_days é bitmask (bit 0 = domingo), start/end em minutos desde a meia-noite (hora de
    // parede da instituição), fim exclusivo, sem cruzar meia-noite. Os três preenchidos = janela
    // ativa; qualquer um null = sem horário, tela sempre no ar (comportamento anterior). O toggle
    // manual "Modo espera" (offline) continua funcionando por cima — se offline=true, fica em
    // espera independente do horário.
    activeDays: integer("active_days"),
    activeStartMinute: integer("active_start_minute"),
    activeEndMinute: integer("active_end_minute"),
    // Rótulo de grupo (texto livre) — telas com o mesmo `group_name` formam um grupo pra ações em
    // lote no admin (recarregar todas, pôr/tirar de espera todas). null = sem grupo. Não afeta a
    // view; é só organização do admin.
    groupName: text("group_name"),
    // Cor livre (hex) pro card/linha desta tela no admin — só organização visual, não afeta a
    // view. null = sem cor (usa só a faixa de status). Aplicada como faixa lateral no card e um
    // marcador na lista, sem substituir a bolinha de status ("precisa de atenção").
    cardColor: text("card_color"),
    // "Congelar" — trava o item que está tocando (a playlist para de avançar) sem ir pra tela de
    // espera. Pra deixar um slide/aviso fixo no ar. O cliente lê via get-output-state + evento
    // "frozen-changed"; o PlaylistLayer desliga o timer e o onEnded enquanto frozen=true.
    frozen: boolean("frozen").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("broadcast_outputs_token_idx").on(table.token)],
);

// "Dayparting" — programação por horário/dia da semana: quando um slot casa com "agora" (na hora
// de parede da instituição, broadcast.timezone), a tela toca a playlist deste slot NO LUGAR da
// playlist padrão da camada de vídeo (config.playlistId). Sem slot casando, cai na padrão — o
// comportamento anterior. Resolvido em get-output-state (shared/playlist-schedule.ts é a helper
// pura). `days` é um bitmask: bit 0 = domingo ... bit 6 = sábado. start_minute/end_minute são
// minutos desde a meia-noite (0–1439), fim exclusivo, sem cruzar meia-noite (o admin quebra "22h
// às 2h" em dois slots). Ambas as FKs cascade — apagar a tela ou a playlist limpa o slot.
export const broadcastOutputPlaylistSchedule = broadcastSchema.table("output_playlist_schedule", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  outputId: text("output_id")
    .notNull()
    .references(() => broadcastOutputs.id, { onDelete: "cascade" }),
  playlistId: text("playlist_id")
    .notNull()
    .references(() => broadcastPlaylists.id, { onDelete: "cascade" }),
  days: integer("days").notNull(),
  startMinute: integer("start_minute").notNull(),
  endMinute: integer("end_minute").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// "Takeover" — comunicado de urgência que cobre TODAS as telas em tela cheia (evacuação, recado
// crítico). Diferente do aviso rápido (broadcast_alerts): o alert é lower-third que empurra o
// conteúdo; o takeover substitui tudo, inclusive telas em modo espera. Mesma mecânica de "no
// máximo um ativo por vez, expira sozinho" dos alerts. media_asset_id (opcional, texto solto sem
// FK — resolução via @/contexts/media em get-output-state) mostra uma imagem em vez de/atrás do
// texto.
export const broadcastTakeover = broadcastSchema.table("takeover", {
  id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
  message: text("message").notNull(),
  mediaAssetId: text("media_asset_id"),
  // Mesma semântica de alerts.target.
  target: text("target"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Proof-of-play — uma linha por vez que um item COMEÇA a tocar numa tela (detectado pelo beacon:
// o nowPlayingItemId mudou). Sem FK: é um log histórico que precisa sobreviver à exclusão da tela
// ou do item; item_label é o snapshot pra humano (o item pode nem existir mais no relatório).
// Índice em played_at pro filtro por período do relatório.
export const broadcastPlaybackLog = broadcastSchema.table(
  "playback_log",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    outputId: text("output_id").notNull(),
    playlistItemId: text("playlist_item_id"),
    itemLabel: text("item_label").notNull(),
    playedAt: timestamp("played_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("broadcast_playback_log_played_at_idx").on(table.playedAt)],
);

// Vínculo agenda↔saída — modelo "opt-in": uma agenda SEM nenhuma linha aqui não aparece em
// NENHUMA saída; só entra no rodízio de uma saída específica quando existe uma linha ligando as
// duas. Trocado do "opt-out" original (sem vínculo = aparece em todas) porque esse comportamento
// confundia: desmarcar a única saída vinculada não "removia" a agenda dali, zerava a restrição e
// fazia ela reaparecer em toda saída, inclusive a que acabou de ser desmarcada — achado real
// reportado pelo usuário. Ambas as FKs cascade — apagar a agenda ou a saída limpa o vínculo
// sozinho, sem deixar linha órfã.
export const broadcastOutputAgendas = broadcastSchema.table(
  "output_agendas",
  {
    outputId: text("output_id")
      .notNull()
      .references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    agendaId: text("agenda_id")
      .notNull()
      .references(() => broadcastAgendas.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.outputId, table.agendaId] })],
);

// "Responsável" por uma agenda específica — pedido explícito: "adicionar um responsável (role
// editor pra cima) com acesso e permissão para alterar apenas a agenda atribuída". userId é texto
// solto sem FK (mesmo racional de playlist_items.mediaAssetId — plugin não pode importar
// contexts/auth/database/schema, regra 7/8 do AGENTS.md); resolução de nome/e-mail sempre passa
// por @/contexts/auth (listUsers). Estar aqui NÃO substitui a permission broadcast.agenda.manage —
// é uma restrição A MAIS sobre ela: alguém sem essa permission continua barrado mesmo que esteja
// atribuído a uma agenda (ver shared/scoped-authorization.ts), o que naturalmente exige "papel
// editor pra cima" antes de a atribuição ter qualquer efeito.
export const broadcastAgendaEditors = broadcastSchema.table(
  "agenda_editors",
  {
    agendaId: text("agenda_id")
      .notNull()
      .references(() => broadcastAgendas.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.agendaId, table.userId] })],
);

// Mesmo racional de broadcastAgendaEditors, só que pra saídas — permission correspondente é
// broadcast.outputs.manage (não broadcast.agenda.manage).
export const broadcastOutputEditors = broadcastSchema.table(
  "output_editors",
  {
    outputId: text("output_id")
      .notNull()
      .references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.outputId, table.userId] })],
);

// Mesmo racional de broadcastAgendaEditors/broadcastOutputEditors, só que pra playlist —
// permission correspondente é broadcast.playlists.manage. Paridade pedida explicitamente:
// "Superadmin pode definir quem são os administradores de telas, playlists e agendas".
export const broadcastPlaylistEditors = broadcastSchema.table(
  "playlist_editors",
  {
    playlistId: text("playlist_id")
      .notNull()
      .references(() => broadcastPlaylists.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.playlistId, table.userId] })],
);

// Diagnóstico (Fase 13, docs/broadcast-plano-correcoes.md — plano original perdido na extração
// pro repo separado, retomado a partir de memória de sessão). "Estado agora" por saída, upsert —
// nunca série temporal (ver comentário de broadcast_output_diag_events abaixo pro log). Duas
// fontes gravam aqui, independentes uma da outra: browser (a própria view de saída reporta saúde
// do vídeo/conexão via token, sem sessão — mesmo racional de broadcastOutputs.token) e agent (um
// script PowerShell rodando no PC da TV, autenticado por chave compartilhada, não por token da
// saída — ver report-agent-diagnostics). A terceira fonte (server: lag do event loop, GC, saúde da
// rota de stream) é processo-inteiro, não por saída — nunca persistida aqui, sempre lida ao vivo
// de runtime/diagnostics-bus.ts.
export const broadcastOutputDiagnostics = broadcastSchema.table(
  "output_diagnostics",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    outputId: text("output_id")
      .notNull()
      .references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    browserSnapshot: jsonb("browser_snapshot"),
    browserReportedAt: timestamp("browser_reported_at", { withTimezone: true }),
    agentSnapshot: jsonb("agent_snapshot"),
    agentReportedAt: timestamp("agent_reported_at", { withTimezone: true }),
    // Rótulo livre que o agent manda junto do report (ex: "Recepção", mesmo texto do
    // $StationLabel do script) — só exibição, não é identidade (quem identifica a estação é o
    // outputToken configurado no script).
    agentStationLabel: text("agent_station_label"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("broadcast_output_diagnostics_output_id_idx").on(table.outputId)],
);

// Log append-only de transições notáveis (vídeo sofrendo travamento, CPU/RAM alta no PC da TV) —
// gerado no MOMENTO em que um snapshot chega e cruza um limiar (ver report-browser-diagnostics/
// report-agent-diagnostics), não por um job varrendo o processo em background. outputId nulo é o
// único caso de evento de escopo `server` (o processo Next.js inteiro, não uma saída específica) —
// não usado nesta primeira entrega (sem detecção de anomalia em background do lado do server
// ainda), mas a coluna já fica pronta pra isso.
export const broadcastOutputDiagEvents = broadcastSchema.table(
  "output_diag_events",
  {
    id: text("id").primaryKey().$defaultFn(() => crypto.randomUUID()),
    outputId: text("output_id").references(() => broadcastOutputs.id, { onDelete: "cascade" }),
    source: text("source").notNull(),
    level: text("level").notNull(),
    message: text("message").notNull(),
    detail: jsonb("detail").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check("broadcast_output_diag_events_source_check", sql`${table.source} in ('browser','agent','server')`),
    check("broadcast_output_diag_events_level_check", sql`${table.level} in ('info','warning')`),
  ],
);
