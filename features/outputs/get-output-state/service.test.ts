import { beforeEach, describe, expect, it, vi } from "vitest";

const getMediaAsset = vi.fn();
vi.mock("@venore/plugin-sdk/media", () => ({
  getMediaAsset: (...args: unknown[]) => getMediaAsset(...args),
}));

const getSetting = vi.fn();
vi.mock("@venore/plugin-sdk/settings", () => ({
  getSetting: (...args: unknown[]) => getSetting(...args),
}));

const getBrandConfig = vi.fn();
vi.mock("@venore/plugin-sdk/brand", () => ({
  getBrandConfig: (...args: unknown[]) => getBrandConfig(...args),
}));

const resolveRegionWeather = vi.fn();
vi.mock("../../../runtime/region-weather", () => ({
  resolveRegionWeather: (...args: unknown[]) => resolveRegionWeather(...args),
}));

const resolveRegionNews = vi.fn();
vi.mock("../../../runtime/region-news", () => ({
  resolveRegionNews: (...args: unknown[]) => resolveRegionNews(...args),
}));

const findOutputByToken = vi.fn();
const findSceneById = vi.fn();
const findLayersBySceneId = vi.fn();
const findVisiblePlaylistItemsByPlaylistId = vi.fn();
const findAllAgendas = vi.fn();
const findAllUpcomingAgendaEvents = vi.fn();
const findAllOutputAgendaLinks = vi.fn();
const findActiveAlert = vi.fn();
const findActiveTakeover = vi.fn();
const findAgendaEventById = vi.fn();
const findPlaylistScheduleForOutput = vi.fn();
vi.mock("./store", () => ({
  findOutputByToken: (...args: unknown[]) => findOutputByToken(...args),
  findSceneById: (...args: unknown[]) => findSceneById(...args),
  findLayersBySceneId: (...args: unknown[]) => findLayersBySceneId(...args),
  findVisiblePlaylistItemsByPlaylistId: (...args: unknown[]) => findVisiblePlaylistItemsByPlaylistId(...args),
  findAllAgendas: (...args: unknown[]) => findAllAgendas(...args),
  findAllUpcomingAgendaEvents: (...args: unknown[]) => findAllUpcomingAgendaEvents(...args),
  findAllOutputAgendaLinks: (...args: unknown[]) => findAllOutputAgendaLinks(...args),
  findActiveAlert: (...args: unknown[]) => findActiveAlert(...args),
  findActiveTakeover: (...args: unknown[]) => findActiveTakeover(...args),
  findAgendaEventById: (...args: unknown[]) => findAgendaEventById(...args),
  findPlaylistScheduleForOutput: (...args: unknown[]) => findPlaylistScheduleForOutput(...args),
}));

describe("getOutputState", () => {
  beforeEach(() => {
    getMediaAsset.mockReset();
    getSetting.mockReset();
    getBrandConfig.mockReset();
    resolveRegionWeather.mockReset();
    resolveRegionNews.mockReset();
    findOutputByToken.mockReset();
    findSceneById.mockReset();
    findLayersBySceneId.mockReset();
    findVisiblePlaylistItemsByPlaylistId.mockReset();
    findAllAgendas.mockReset();
    findAllUpcomingAgendaEvents.mockReset();
    findAllOutputAgendaLinks.mockReset();
    findActiveAlert.mockReset();
    findActiveTakeover.mockReset();
    findAgendaEventById.mockReset();
    findPlaylistScheduleForOutput.mockReset();
    // Defaults sensatos pra testes que disparam a resolução (agora a camada "video" também
    // dispara clima/logo/cor de marca) mas não se importam com o valor exato.
    getSetting.mockResolvedValue({ success: false });
    getBrandConfig.mockResolvedValue({ logoUrl: null });
    resolveRegionWeather.mockResolvedValue(null);
    // Sem vínculo nenhum = agenda não aparece em nenhuma saída (modelo opt-in, ver schema) — os
    // testes que precisam de agenda na rotação sobrescrevem com o vínculo explícito pro outputId
    // usado no teste.
    findAllOutputAgendaLinks.mockResolvedValue([]);
    // Sem programação de playlist por horário e sem takeover ativo por padrão — os testes de
    // dayparting/takeover sobrescrevem.
    findPlaylistScheduleForOutput.mockResolvedValue([]);
    findActiveTakeover.mockResolvedValue(null);
    findAgendaEventById.mockResolvedValue(null);
  });

  it("fails when the token does not match any output", async () => {
    findOutputByToken.mockResolvedValue(null);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "missing" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.get-output-state.not_found");
  });

  it("returns an empty scene/layers when the output has no current scene", async () => {
    findOutputByToken.mockResolvedValue({
      id: "o1",
      drawerOpen: false,
      footerOpen: false,
      offline: false,
      tickerEnabled: false,
      agendaOpenSeconds: null,
      agendaPauseSeconds: null,
      currentSceneId: null,
    });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result).toEqual({
      success: true,
      data: {
        outputId: "o1",
        drawerOpen: false,
        footerOpen: false,
        offline: false,
        tickerEnabled: false,
        hasPlayableContent: false,
        fallbackUrl: null,
        takeoverMessage: null,
        takeoverMediaUrl: null,
        takeoverExpiresAt: null,
        scene: null,
        layers: [],
        playlistItemsByPlaylistId: {},
        resolvedAssetUrlByLayerId: {},
        regionWeather: null,
        regionNews: [],
        agendaRotation: [],
        activeAlertMessage: null,
        activeAlertExpiresAt: null,
        brandLogoUrl: null,
        brandColor: "#111",
        agendaAnimationStyle: "fade",
        agendaViewSize: "grande",
        timeZone: "America/Sao_Paulo",
        agendaOpenSeconds: null,
        agendaPauseSeconds: null,
        sync: null,
      },
    });
    expect(findSceneById).not.toHaveBeenCalled();
    expect(resolveRegionWeather).not.toHaveBeenCalled();
    expect(resolveRegionNews).not.toHaveBeenCalled();
    expect(findAllAgendas).not.toHaveBeenCalled();
    expect(findActiveAlert).not.toHaveBeenCalled();
    expect(getBrandConfig).not.toHaveBeenCalled();
  });

  it("classifies local playlist items as video or image by extension, and resolves asset URLs for image layers", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Abertura" });
    findLayersBySceneId.mockResolvedValue([
      { id: "l1", type: "video", config: { playlistId: "p1" } },
      { id: "l2", type: "image", config: { mediaAssetId: "asset-1" } },
      { id: "l3", type: "text", config: { text: "Bem-vindo" } },
    ]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([
      { id: "item-1", order: 0, sourceType: "local", relativePath: "clips/intro.mp4", mediaAssetId: null, url: null, durationSeconds: null, withAudio: true },
      { id: "item-2", order: 1, sourceType: "local", relativePath: "clips/slide.jpg", mediaAssetId: null, url: null, durationSeconds: null, withAudio: false },
    ]);
    getMediaAsset.mockResolvedValue({ success: true, data: { id: "asset-1", url: "https://blob.example/logo.png" } });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.playlistItemsByPlaylistId).toEqual({
      p1: [
        { id: "item-1", order: 0, kind: "video", label: "intro.mp4", durationSeconds: null, url: null, withAudio: true, event: null },
        { id: "item-2", order: 1, kind: "image", label: "slide.jpg", durationSeconds: 15, url: null, withAudio: false, event: null },
      ],
    });
    expect(result.data.resolvedAssetUrlByLayerId).toEqual({ l2: "https://blob.example/logo.png" });
  });

  it("defaults webpage items to 60s and news items to 30s when no duration is set", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([
      { id: "item-1", order: 0, sourceType: "webpage", relativePath: null, mediaAssetId: null, url: "/cursos", durationSeconds: null, withAudio: true },
      { id: "item-2", order: 1, sourceType: "news", relativePath: null, mediaAssetId: null, url: null, durationSeconds: null, withAudio: false },
    ]);
    resolveRegionNews.mockResolvedValue([]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.playlistItemsByPlaylistId.p1).toEqual([
      { id: "item-1", order: 0, kind: "webpage", label: "/cursos", durationSeconds: 60, url: "/cursos", withAudio: true, event: null },
      { id: "item-2", order: 1, kind: "news", label: "Notícias", durationSeconds: 30, url: null, withAudio: false, event: null },
    ]);
  });

  it("resolves news when a playlist item classifies as news, even without a dedicated news layer", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([
      { id: "item-1", order: 0, sourceType: "news", relativePath: null, mediaAssetId: null, url: null, durationSeconds: null },
    ]);
    resolveRegionNews.mockResolvedValue([{ title: "Notícia", description: null, link: "https://example.com", imageUrl: null, sourceName: null }]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(resolveRegionNews).toHaveBeenCalledTimes(1);
    expect(result.success && result.data.regionNews).toHaveLength(1);
  });

  it("groups upcoming events by agenda, drops agendas with no upcoming events, and resolves the brand logo (fallback for agendas without their own)", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "agenda", config: {} }]);
    findAllAgendas.mockResolvedValue([
      { id: "a1", name: "Semanal", displaySeconds: 20, order: 0, backgroundColor: null, logoMediaAssetId: null },
      { id: "a2", name: "Mensal", displaySeconds: 30, order: 1, backgroundColor: "#1a1a2e", logoMediaAssetId: null },
    ]);
    findAllUpcomingAgendaEvents.mockResolvedValue([
      { id: "e1", agendaId: "a1", title: "Reunião", startAt: new Date(), coverMediaAssetId: null, extraDates: [] },
    ]);
    findAllOutputAgendaLinks.mockResolvedValue([{ outputId: "o1", agendaId: "a1" }]);
    getBrandConfig.mockResolvedValue({ logoUrl: "https://example.com/logo.png" });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agendaRotation).toEqual([
      {
        agenda: { id: "a1", name: "Semanal", displaySeconds: 20, order: 0, backgroundColor: null, logoMediaAssetId: null },
        events: [
          {
            id: "e1",
            agendaId: "a1",
            title: "Reunião",
            startAt: expect.any(Date),
            endAt: null,
            coverMediaAssetId: null,
            extraDates: [],
            coverUrl: null,
          },
        ],
        logoUrl: null,
      },
    ]);
    expect(result.data.brandLogoUrl).toBe("https://example.com/logo.png");
    expect(getBrandConfig).toHaveBeenCalledWith("png");
    // Relógio/clima saíram da coluna de agenda pra barra inferior da camada "video" — uma cena só
    // com "agenda" não deve mais disparar clima nenhum.
    expect(resolveRegionWeather).not.toHaveBeenCalled();
  });

  it("keeps a weekly recurring event even when its startAt anchor is in the past, and sends the client its next occurrence instead of the raw anchor", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "agenda", config: {} }]);
    findAllAgendas.mockResolvedValue([
      { id: "a1", name: "Semanal", displaySeconds: 20, order: 0, backgroundColor: null, logoMediaAssetId: null },
    ]);
    // Âncora de meses atrás — findAllUpcomingAgendaEvents já filtra "startAt >= agora OU
    // recurring", então o mock aqui simula exatamente isso: a query devolveu o evento mesmo com
    // startAt no passado, por ser recurring=true.
    const oldAnchor = new Date(Date.now() - 1000 * 60 * 60 * 24 * 90);
    findAllUpcomingAgendaEvents.mockResolvedValue([
      { id: "e1", agendaId: "a1", title: "Reunião semanal", startAt: oldAnchor, recurring: true, coverMediaAssetId: null },
    ]);
    findAllOutputAgendaLinks.mockResolvedValue([{ outputId: "o1", agendaId: "a1" }]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agendaRotation).toHaveLength(1);
    const [event] = result.data.agendaRotation[0].events;
    expect(event.id).toBe("e1");
    // A data mandada pro client não é a âncora crua — é a próxima ocorrência, sempre >= agora.
    expect(event.startAt.getTime()).toBeGreaterThan(Date.now());
    expect(event.startAt.getDay()).toBe(oldAnchor.getDay());
  });

  it("passes a one-off event's extra dates through to the client untouched", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "agenda", config: {} }]);
    findAllAgendas.mockResolvedValue([
      { id: "a1", name: "Semanal", displaySeconds: 20, order: 0, backgroundColor: null, logoMediaAssetId: null },
    ]);
    const primary = new Date("2026-09-10T14:00:00Z");
    const extra = { id: "d1", startAt: new Date("2026-09-15T14:00:00Z"), endAt: new Date("2026-09-15T16:00:00Z") };
    findAllUpcomingAgendaEvents.mockResolvedValue([
      { id: "e1", agendaId: "a1", title: "Evento em dois dias", startAt: primary, endAt: null, recurring: false, coverMediaAssetId: null, extraDates: [extra] },
    ]);
    findAllOutputAgendaLinks.mockResolvedValue([{ outputId: "o1", agendaId: "a1" }]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const [event] = result.data.agendaRotation[0].events;
    expect(event.extraDates).toEqual([extra]);
  });

  it("only shows an agenda on an output it's explicitly linked to — excludes agendas linked elsewhere and agendas with no link at all (opt-in model)", async () => {
    findOutputByToken.mockResolvedValue({ id: "o-externa", drawerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "agenda", config: {} }]);
    findAllAgendas.mockResolvedValue([
      { id: "a-admin", name: "Administrativo", displaySeconds: 20, order: 0, backgroundColor: null, logoMediaAssetId: null },
      { id: "a-geral", name: "Geral", displaySeconds: 20, order: 1, backgroundColor: null, logoMediaAssetId: null },
      { id: "a-sem-vinculo", name: "Sem vínculo", displaySeconds: 20, order: 2, backgroundColor: null, logoMediaAssetId: null },
    ]);
    findAllUpcomingAgendaEvents.mockResolvedValue([
      { id: "e1", agendaId: "a-admin", title: "Reunião interna", startAt: new Date(), coverMediaAssetId: null },
      { id: "e2", agendaId: "a-geral", title: "Evento aberto", startAt: new Date(), coverMediaAssetId: null },
      { id: "e3", agendaId: "a-sem-vinculo", title: "Nunca vinculado", startAt: new Date(), coverMediaAssetId: null },
    ]);
    // "Administrativo" só está vinculada à saída "o-interna" — não aparece em "o-externa".
    // "Geral" está vinculada a "o-externa" — aparece.
    // "Sem vínculo" nunca foi vinculada a saída nenhuma — não aparece em lugar nenhum (achado
    // real reportado pelo usuário quando o modelo ainda era opt-out: desmarcar a única saída
    // vinculada não escondia a agenda, reativava "aparece em todas").
    findAllOutputAgendaLinks.mockResolvedValue([
      { outputId: "o-interna", agendaId: "a-admin" },
      { outputId: "o-externa", agendaId: "a-geral" },
    ]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agendaRotation.map((entry) => entry.agenda.id)).toEqual(["a-geral"]);
  });

  it("resolves per-agenda logo and per-event cover images via media assets", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "agenda", config: {} }]);
    findAllAgendas.mockResolvedValue([
      { id: "a1", name: "Semanal", displaySeconds: 20, order: 0, backgroundColor: null, logoMediaAssetId: "logo-1" },
    ]);
    findAllUpcomingAgendaEvents.mockResolvedValue([
      { id: "e1", agendaId: "a1", title: "Reunião", startAt: new Date(), coverMediaAssetId: "cover-1" },
    ]);
    findAllOutputAgendaLinks.mockResolvedValue([{ outputId: "o1", agendaId: "a1" }]);
    getMediaAsset.mockImplementation(async ({ id }: { id: string }) => {
      if (id === "logo-1") return { success: true, data: { id, url: "https://example.com/agenda-logo.png" } };
      if (id === "cover-1") return { success: true, data: { id, url: "https://example.com/event-cover.jpg" } };
      return { success: true, data: null };
    });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agendaRotation[0].logoUrl).toBe("https://example.com/agenda-logo.png");
    expect(result.data.agendaRotation[0].events[0].coverUrl).toBe("https://example.com/event-cover.jpg");
  });

  it("resolves weather, brand logo, and brand color when the output's footer is open (BrandFooterBar needs all three)", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, footerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([]);
    resolveRegionWeather.mockResolvedValue({ temperatureC: 18, weatherCode: 2, conditionLabel: "Nublado", emoji: "⛅" });
    getBrandConfig.mockResolvedValue({ logoUrl: "https://example.com/logo.png" });
    getSetting.mockResolvedValue({ success: true, data: { value: "#221100" } });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.regionWeather).toEqual({ temperatureC: 18, weatherCode: 2, conditionLabel: "Nublado", emoji: "⛅" });
    expect(result.data.brandLogoUrl).toBe("https://example.com/logo.png");
    expect(result.data.brandColor).toBe("#221100");
  });

  it("skips weather and brand logo resolution when the output's footer is closed, even with a video layer present", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, footerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.regionWeather).toBeNull();
    expect(result.data.brandLogoUrl).toBeNull();
    expect(resolveRegionWeather).not.toHaveBeenCalled();
    expect(getBrandConfig).not.toHaveBeenCalled();
  });

  it("falls back to the default brand color when the setting is not configured", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, footerOpen: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success && result.data.brandColor).toBe("#111");
  });

  it("carries the offline flag through and resolves brand logo + color for the standby screen even with the footer closed", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, footerOpen: false, offline: true, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([]);
    getBrandConfig.mockResolvedValue({ logoUrl: "https://example.com/logo.png" });
    getSetting.mockResolvedValue({ success: true, data: { value: "#221100" } });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.offline).toBe(true);
    expect(result.data.brandLogoUrl).toBe("https://example.com/logo.png");
    expect(result.data.brandColor).toBe("#221100");
  });

  it("defaults offline to false and does not resolve brand logo for the standby screen when the output is online with the footer closed", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, footerOpen: false, offline: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Principal" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "video", config: { playlistId: "p1" } }]);
    findVisiblePlaylistItemsByPlaylistId.mockResolvedValue([]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.offline).toBe(false);
    expect(getBrandConfig).not.toHaveBeenCalled();
  });

  it("skips agenda resolution when the agenda sidebar is closed (drawerOpen=false), even with an agenda layer present", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "agenda", config: {} }]);

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.agendaRotation).toEqual([]);
    expect(findAllAgendas).not.toHaveBeenCalled();
  });

  it("resolves the active alert message and expiry only when the scene has an alert layer", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Painel" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "alert", config: {} }]);
    const expiresAt = new Date("2026-01-01T12:00:10.000Z");
    findActiveAlert.mockResolvedValue({ message: "Reunião às 15h no auditório", expiresAt });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success && result.data.activeAlertMessage).toBe("Reunião às 15h no auditório");
    expect(result.success && result.data.activeAlertExpiresAt).toBe(expiresAt.toISOString());
  });

  it("skips a media asset that no longer resolves instead of failing the whole state", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Abertura" });
    findLayersBySceneId.mockResolvedValue([{ id: "l2", type: "image", config: { mediaAssetId: "gone" } }]);
    getMediaAsset.mockResolvedValue({ success: true, data: null });

    const { getOutputState } = await import("./service");
    const result = await getOutputState({ token: "tok-1" });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.resolvedAssetUrlByLayerId).toEqual({});
  });

  it("does not call the weather/news/agenda/alert resolvers when the scene has none of those layer types", async () => {
    findOutputByToken.mockResolvedValue({ id: "o1", drawerOpen: false, currentSceneId: "s1" });
    findSceneById.mockResolvedValue({ id: "s1", name: "Vídeo" });
    findLayersBySceneId.mockResolvedValue([{ id: "l1", type: "text", config: { text: "Olá" } }]);

    const { getOutputState } = await import("./service");
    await getOutputState({ token: "tok-1" });

    expect(resolveRegionWeather).not.toHaveBeenCalled();
    expect(resolveRegionNews).not.toHaveBeenCalled();
    expect(findAllAgendas).not.toHaveBeenCalled();
    expect(findActiveAlert).not.toHaveBeenCalled();
  });
});
