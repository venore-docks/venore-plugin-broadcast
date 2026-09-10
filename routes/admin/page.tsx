import { CalendarDays, ListVideo, Settings as SettingsIcon, Tv, Users } from "lucide-react";
import { listUsers } from "@venore/plugin-sdk/auth";
import { AdminAccessDenied } from "@venore/plugin-sdk/ui";
import { AdminPageHeader } from "@venore/plugin-sdk/ui";
import { getPluginAdminPageData } from "@venore/plugin-sdk/admin";
import {
  listAgendaEditors,
  listAgendaEvents,
  listAgendaOutputs,
  listAgendas,
  listOutputEditors,
  listOutputPlaylistSchedules,
  listOutputs,
  listPlaylistEditors,
  listPlaylistItems,
  listPlaylists,
} from "../../index";
import type {
  BroadcastAgendaEventRecord,
  BroadcastOutputRecord,
  BroadcastPlaylistItemRecord,
  BroadcastPlaylistRecord,
} from "../../contracts/types";
import { AdminOverviewNav } from "../../components/admin/admin-overview-nav";
import { agendasTabStatus, outputsTabStatus, playlistsTabStatus } from "../../components/admin/status";
import {
  getBroadcastAgendaAnimationStyle,
  getBroadcastAgendaViewSize,
  getBroadcastBrandColor,
  getBroadcastNewsExcludeKeywords,
  getBroadcastRegion,
  getBroadcastTimezone,
} from "../../components/admin/actions";
import { DEFAULT_BROADCAST_TIMEZONE } from "../../shared/timezone";
import { resolvePickableMediaById } from "../../components/admin/resolve-pickable-media";
import { resolveOutputPlaylistIds } from "../../components/admin/resolve-output-playlist-ids";
import { PlaylistsSection } from "../../components/admin/playlists-section";
import { OutputsSection } from "../../components/admin/outputs-section";
import { SettingsSection } from "../../components/admin/settings-section";
import { AgendaSection } from "../../components/admin/agenda-section";
import { ResponsiblesSection } from "../../components/admin/responsibles-section";
import { OnboardingChecklist } from "../../components/admin/onboarding-checklist";

// Único ponto de entrada do plugin no admin (pedido explícito: "não separe os links na navegação
// admin") — chegou a existir uma rota satélite por permission (/admin/broadcast/agenda,
// /admin/broadcast/telas, cada uma com seu próprio link), absorvidas aqui: a página decide sozinha
// o quanto mostrar a partir de gate.actor.permissions. broadcast.manage vê tudo; quem só tem
// broadcast.agenda.manage/broadcast.outputs.manage/broadcast.playlists.manage (responsável
// atribuído, ver shared/scoped-authorization) vê só a(s) seção(ões) correspondente(s), sem aba
// nenhuma quando é só uma — uma Tabs de item único é ruído, não navegação. A aba "Responsáveis"
// segue o mesmo hasFullAccess das outras (decisão explícita: "qualquer Admin do Estúdio", ou seja
// broadcast.manage, delega — não mais só Superadmin).
export default async function BroadcastAdminPage() {
  const gate = await getPluginAdminPageData("broadcast");
  if (!gate.granted) {
    return <AdminAccessDenied message="Você não tem permissão para ver o Broadcast Studio." />;
  }

  const hasFullAccess = gate.actor.isSuperadmin || gate.actor.permissions.includes("broadcast.manage");
  const hasAgendaAccess = hasFullAccess || gate.actor.permissions.includes("broadcast.agenda.manage");
  const hasOutputsAccess = hasFullAccess || gate.actor.permissions.includes("broadcast.outputs.manage");
  const hasPlaylistsAccess = hasFullAccess || gate.actor.permissions.includes("broadcast.playlists.manage");
  // A aba "Responsáveis" usa exatamente os mesmos dados já buscados sob hasFullAccess logo abaixo
  // (outputs/playlists/agendas/editores/allUsers) — nunca precisa de uma leva própria.

  // Uma única onda pra tudo que não depende de resultado de outra query (só depende dos flags de
  // permission já resolvidos acima) — as duas rodadas de Promise.all que existiam antes aqui
  // (playlists/outputs/agendas/eventos, depois vínculo/responsáveis/usuários/settings) não tinham
  // dependência de dado entre si, só viviam em blocos separados por acidente de organização; cada
  // bloco extra era uma ida a mais ao banco em série (ver AGENTS.md — a demora nas actions de
  // /admin/broadcast vem do revalidatePath re-renderizando esta página inteira na mesma request).
  const [
    playlistsResult,
    outputsResult,
    agendasResult,
    agendaEventsResult,
    agendaOutputsResult,
    agendaEditorsResult,
    outputEditorsResult,
    playlistEditorsResult,
    outputSchedulesResult,
    usersResult,
    region,
    timezone,
    brandColor,
    newsExcludeKeywords,
    agendaAnimationStyle,
    agendaViewSize,
  ] = await Promise.all([
    // listPlaylists já se auto-restringe por ator dentro do handler (lista inteira pra
    // broadcast.manage/broadcast.outputs.manage, só as atribuídas pra quem só tem
    // broadcast.playlists.manage) — qualquer um dos três precisa chamar.
    hasFullAccess || hasOutputsAccess || hasPlaylistsAccess ? listPlaylists() : Promise.resolve(null),
    hasOutputsAccess ? listOutputs() : Promise.resolve(null),
    hasAgendaAccess ? listAgendas() : Promise.resolve(null),
    hasAgendaAccess ? listAgendaEvents() : Promise.resolve(null),
    hasFullAccess ? listAgendaOutputs() : Promise.resolve(null),
    hasFullAccess ? listAgendaEditors() : Promise.resolve(null),
    hasFullAccess ? listOutputEditors() : Promise.resolve(null),
    hasFullAccess ? listPlaylistEditors() : Promise.resolve(null),
    hasFullAccess ? listOutputPlaylistSchedules() : Promise.resolve(null),
    hasFullAccess ? listUsers() : Promise.resolve(null),
    hasFullAccess ? getBroadcastRegion() : Promise.resolve(""),
    hasFullAccess ? getBroadcastTimezone() : Promise.resolve(DEFAULT_BROADCAST_TIMEZONE),
    hasFullAccess ? getBroadcastBrandColor() : Promise.resolve(""),
    hasFullAccess ? getBroadcastNewsExcludeKeywords() : Promise.resolve(""),
    hasFullAccess ? getBroadcastAgendaAnimationStyle() : Promise.resolve("fade"),
    hasFullAccess ? getBroadcastAgendaViewSize() : Promise.resolve("grande"),
  ]);

  const playlists: BroadcastPlaylistRecord[] = playlistsResult?.success ? playlistsResult.data : [];
  const outputs: BroadcastOutputRecord[] = outputsResult?.success ? outputsResult.data : [];
  const agendas = agendasResult?.success ? agendasResult.data : [];
  const agendaEvents: BroadcastAgendaEventRecord[] = agendaEventsResult?.success ? agendaEventsResult.data : [];
  const agendaOutputIdsByAgendaId = agendaOutputsResult?.success ? agendaOutputsResult.data : {};
  const agendaEditorUserIdsByAgendaId = agendaEditorsResult?.success ? agendaEditorsResult.data : {};
  const outputEditorUserIdsByOutputId = outputEditorsResult?.success ? outputEditorsResult.data : {};
  const playlistEditorUserIdsByPlaylistId = playlistEditorsResult?.success ? playlistEditorsResult.data : {};
  const outputPlaylistSchedulesByOutputId = outputSchedulesResult?.success ? outputSchedulesResult.data : {};
  const allUsers = usersResult?.success ? usersResult.data : [];

  const eventsByAgenda: Record<string, typeof agendaEvents> = {};
  for (const event of agendaEvents) {
    (eventsByAgenda[event.agendaId] ??= []).push(event);
  }

  // Nome das agendas vinculadas a cada tela (inverso de agendaOutputIdsByAgendaId) — mostrado no
  // card da Tela pra deixar a relação Tela↔Agenda visível de onde o operador realmente olha (até
  // aqui só dava pra ver o vínculo do lado da Agenda, via "Onde aparece").
  const agendaNamesByOutputId: Record<string, string[]> = {};
  for (const agenda of agendas) {
    for (const outputId of agendaOutputIdsByAgendaId[agenda.id] ?? []) {
      (agendaNamesByOutputId[outputId] ??= []).push(agenda.name);
    }
  }

  // Segunda onda: tudo aqui depende de dado resolvido na primeira (agendas/eventos/outputs/
  // playlists), mas os itens não dependem uns dos outros — mesma lógica, uma query a menos em
  // série. Pré-carrega a mídia já selecionada de cada agenda/evento (filename/url/contentType) pro
  // MediaPickerField dos formulários de edição nascer preenchido — sem isso, editar qualquer outro
  // campo limparia a logo/capa por engano (o campo hidden do picker some quando "sem seleção").
  // itemsByPlaylist só é buscado quando a aba Playlists de fato aparece (hasFullAccess ou
  // hasPlaylistsAccess) — um ator só com hasOutputsAccess usa a lista de playlists só pro seletor
  // de "qual playlist esta tela toca", nunca precisa do conteúdo item a item.
  const [agendaLogoMediaById, eventCoverMediaById, outputPlaylistById, itemsByPlaylist] = await Promise.all([
    resolvePickableMediaById(agendas, (agenda) => agenda.logoMediaAssetId),
    resolvePickableMediaById(agendaEvents, (event) => event.coverMediaAssetId),
    hasOutputsAccess ? resolveOutputPlaylistIds(outputs) : Promise.resolve({} as Record<string, string | null>),
    hasFullAccess || hasPlaylistsAccess
      ? Promise.all(
          playlists.map(async (playlist) => {
            const result = await listPlaylistItems({ playlistId: playlist.id });
            return [playlist.id, result.success ? result.data : []] as const;
          }),
        ).then((entries) => Object.fromEntries(entries))
      : Promise.resolve({} as Record<string, BroadcastPlaylistItemRecord[]>),
  ]);

  // Nome das telas que tocam cada playlist (inverso de outputPlaylistById) — pedido explícito:
  // "adiciona uma badge mostrando [...] a quantidade de lugares onde essa playlist é usada.
  // Quando clicar, mostra os locais (Telas cadastradas)". Só existe quando hasOutputsAccess já
  // buscou outputPlaylistById de verdade (ver acima) — pra um ator só com
  // broadcast.playlists.manage, sem acesso a Telas, fica vazio (não temos esse dado pra ele,
  // mesma restrição de acesso que já vale pro resto da página).
  const outputNamesByPlaylistId: Record<string, string[]> = {};
  for (const output of outputs) {
    const playlistId = outputPlaylistById[output.id];
    if (playlistId) (outputNamesByPlaylistId[playlistId] ??= []).push(output.name);
  }

  // Miniatura dos itens "media-asset" da playlist (filename/url/contentType) — o resolver ignora
  // itens sem mediaAssetId, então só resolve os da biblioteca; vídeo local não tem thumb sem
  // ffmpeg e fica com o ícone. Keyed por item.id (ver resolvePickableMediaById).
  const playlistItemMediaById = await resolvePickableMediaById(
    Object.values(itemsByPlaylist).flat(),
    (item) => item.mediaAssetId,
  );

  const outputsView = (
    <OutputsSection
      outputs={outputs}
      playlists={playlists}
      outputPlaylistById={outputPlaylistById}
      schedulesByOutputId={outputPlaylistSchedulesByOutputId}
      canManageAll={hasFullAccess}
      agendaNamesByOutputId={agendaNamesByOutputId}
    />
  );
  const playlistsView = (
    <PlaylistsSection
      playlists={playlists}
      itemsByPlaylist={itemsByPlaylist}
      itemMediaById={playlistItemMediaById}
      agendas={agendas}
      agendaEvents={agendaEvents}
      outputNamesByPlaylistId={outputNamesByPlaylistId}
      canManageAll={hasFullAccess}
    />
  );
  const agendaView = (
    <AgendaSection
      agendas={agendas}
      eventsByAgenda={eventsByAgenda}
      agendaLogoMediaById={agendaLogoMediaById}
      eventCoverMediaById={eventCoverMediaById}
      outputs={outputs}
      agendaOutputIdsByAgendaId={agendaOutputIdsByAgendaId}
      canManageAll={hasFullAccess}
    />
  );
  const settingsView = (
    <SettingsSection
      region={region}
      timezone={timezone}
      brandColor={brandColor}
      newsExcludeKeywords={newsExcludeKeywords}
      agendaAnimationStyle={agendaAnimationStyle}
      agendaViewSize={agendaViewSize}
    />
  );
  const adminsView = (
    <ResponsiblesSection
      outputs={outputs}
      playlists={playlists}
      agendas={agendas}
      allUsers={allUsers}
      outputEditorUserIdsByOutputId={outputEditorUserIdsByOutputId}
      playlistEditorUserIdsByPlaylistId={playlistEditorUserIdsByPlaylistId}
      agendaEditorUserIdsByAgendaId={agendaEditorUserIdsByAgendaId}
      outputPlaylistById={outputPlaylistById}
      agendaOutputIdsByAgendaId={agendaOutputIdsByAgendaId}
    />
  );

  // Semáforo por área (ver status.ts) — reaproveita o mesmo dado já resolvido acima pras views,
  // só reduzido pro formato que os agregadores esperam (id -> bool/contagem). Mostrado nos cards
  // grandes do AdminOverviewNav e no ponto colorido de cada TabsTrigger.
  const outputHasPlaylistById: Record<string, boolean> = Object.fromEntries(
    outputs.map((output) => [output.id, Boolean(outputPlaylistById[output.id])]),
  );
  const playlistItemCountById: Record<string, number> = Object.fromEntries(
    playlists.map((playlist) => [playlist.id, (itemsByPlaylist[playlist.id] ?? []).length]),
  );
  const agendaEventCountById: Record<string, number> = Object.fromEntries(
    agendas.map((agenda) => [agenda.id, (eventsByAgenda[agenda.id] ?? []).length]),
  );
  const agendaLinkedOutputCountById: Record<string, number> = Object.fromEntries(
    agendas.map((agenda) => [agenda.id, (agendaOutputIdsByAgendaId[agenda.id] ?? []).length]),
  );

  // Lista de abas montada dinamicamente a partir do que o ator pode ver — substitui a escada fixa
  // de if/else que existia aqui antes (só cobria as combinações de duas permissions escopadas;
  // com a terceira, broadcast.playlists.manage, o número de combinações explode). Uma única fonte
  // de verdade: cada entrada decide sozinha se aparece, e o componente só decide entre "várias
  // abas" (Tabs) e "uma seção direta" (sem Tabs, ruído de navegação pra um item só).
  const tabs = [
    hasOutputsAccess && {
      key: "outputs",
      label: "Telas",
      icon: <Tv aria-hidden="true" />,
      description: "Uma tela é uma URL — abra ela no navegador da TV. Escolha a playlist que ela toca e se a agenda/rodapé aparecem.",
      view: outputsView,
      status: outputsTabStatus(outputs, outputHasPlaylistById),
      itemCount: outputs.length,
    },
    (hasFullAccess || hasPlaylistsAccess) && {
      key: "playlists",
      label: "Playlists",
      icon: <ListVideo aria-hidden="true" />,
      description: "Uma playlist é a lista de vídeos, imagens, páginas web e notícias que uma tela reproduz em sequência.",
      view: playlistsView,
      status: playlistsTabStatus(playlists, playlistItemCountById),
      itemCount: playlists.length,
    },
    hasAgendaAccess && {
      key: "agenda",
      label: "Agenda",
      icon: <CalendarDays aria-hidden="true" />,
      description: "Eventos mostrados na coluna de agenda — só os que ainda vão acontecer aparecem na TV.",
      view: agendaView,
      status: agendasTabStatus(agendas, agendaEventCountById, agendaLinkedOutputCountById),
      itemCount: agendas.length,
    },
    hasFullAccess && {
      key: "settings",
      label: "Configurações",
      icon: <SettingsIcon aria-hidden="true" />,
      description: "",
      view: settingsView,
    },
    hasFullAccess && {
      key: "admins",
      label: "Responsáveis",
      icon: <Users aria-hidden="true" />,
      description: "",
      view: adminsView,
    },
  ].filter((tab): tab is Exclude<typeof tab, false> => tab !== false);

  const hasScreen = outputs.length > 0;
  const hasContent = Object.values(itemsByPlaylist).some((items) => items.length > 0);

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title="Broadcast Studio"
        description={
          hasFullAccess
            ? "Monte playlists de vídeo/imagem/site/notícias, gerencie a agenda e gere a URL que abre na TV — o layout da tela é fixo e cuidado automaticamente."
            : "As telas, playlists e/ou agendas atribuídas a você."
        }
      />

      {hasFullAccess && (!hasScreen || !hasContent) && <OnboardingChecklist hasScreen={hasScreen} hasContent={hasContent} />}

      {tabs.length > 1 ? <AdminOverviewNav tabs={tabs} /> : tabs[0]?.view}
    </div>
  );
}
