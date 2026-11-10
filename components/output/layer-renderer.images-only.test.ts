import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BroadcastLayerRecord, PlaylistItemSummary } from "../../contracts/types";
import type { BroadcastPlaylistSlideshow } from "../../shared/slideshow";

// Regressão: "quando há apenas imagens na playlist, a transmissão fica off". Antes da v1.10 o
// PlaylistLayer exigia ao menos um vídeo e caía na StandbyScreen "Nenhum conteúdo programado".
// DOM manual — mesmo racional de image-slideshow.test.ts.
const globals = globalThis as unknown as Record<string, unknown>;
let createRoot: typeof import("react-dom/client").createRoot;
let LayerRenderer: typeof import("./layer-renderer").LayerRenderer;
let dom: JSDOM;
let container: HTMLDivElement;
let root: Root;

const videoLayer = { id: "l1", type: "video", visible: true, zIndex: 1, config: { playlistId: "p1" } } as unknown as BroadcastLayerRecord;

const item = (id: string, kind: PlaylistItemSummary["kind"], durationSeconds: number | null = 8): PlaylistItemSummary => ({
  id,
  order: 0,
  kind,
  label: id,
  durationSeconds,
  url: null,
  withAudio: false,
  event: null,
});

function renderLayer(items: PlaylistItemSummary[], slideshow?: BroadcastPlaylistSlideshow) {
  act(() => {
    root.render(
      createElement(LayerRenderer, {
        layer: videoLayer,
        drawerOpen: false,
        playlistItemsByPlaylistId: { p1: items },
        playlistSlideshowByPlaylistId: slideshow ? { p1: slideshow } : {},
        resolvedAssetUrlByLayerId: {},
        regionWeather: null,
        regionNews: [],
        agendaRotation: [],
        brandLogoUrl: null,
        brandColor: "#006b82",
        agendaAnimationStyle: "fade",
        agendaViewSize: "padrao",
        footerOpen: false,
        tickerEnabled: false,
        timeZone: "America/Sao_Paulo",
      } as never),
    );
  });
}

beforeAll(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  globals.window = dom.window;
  globals.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
  ({ LayerRenderer } = await import("./layer-renderer"));
});

afterAll(() => {
  dom.window.close();
  for (const key of ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"]) delete globals[key];
});

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe("PlaylistLayer with an images-only playlist", () => {
  it("plays the images instead of falling back to the standby screen", () => {
    renderLayer([item("img-1", "image"), item("img-2", "image")]);

    expect(container.textContent).not.toContain("Nenhum conteúdo programado");
    expect(container.querySelector('img[src="/api/broadcast/stream/img-1"]')).not.toBeNull();
  });

  it("advances to the next image after its duration and runs the configured transition", () => {
    renderLayer([item("img-1", "image", 5), item("img-2", "image", 5)], {
      motion: "zoom-in",
      motionStrength: "medium",
      transition: "fade",
      transitionMs: 600,
    });

    act(() => {
      vi.advanceTimersByTime(5000);
    });

    const sources = Array.from(container.querySelectorAll("img")).map((image) => image.getAttribute("src"));
    expect(sources).toContain("/api/broadcast/stream/img-2");
    // durante a transição a anterior ainda está por baixo
    expect(sources).toContain("/api/broadcast/stream/img-1");

    act(() => {
      vi.advanceTimersByTime(600 + 200);
    });
    const after = Array.from(container.querySelectorAll("img")).map((image) => image.getAttribute("src"));
    expect(after).toEqual(["/api/broadcast/stream/img-2"]);
  });

  it("still shows the standby screen for a playlist with neither video nor image", () => {
    renderLayer([item("page-1", "webpage", 60)]);

    expect(container.textContent).toContain("Nenhum conteúdo programado");
  });
});
