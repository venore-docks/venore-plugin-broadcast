import { JSDOM } from "jsdom";
import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { BroadcastPlaylistSlideshow } from "../../shared/slideshow";
import { FreezeContext } from "./now-playing-context";
import { ImageSlideStack, type ImageSlideInfo } from "./image-slideshow";

// DOM manual (JSDOM) em vez do ambiente jsdom do vitest (que não carrega teste de repo-irmão fora
// do root do core — vitest.plugins.config.ts roda ../venore-plugin-*). O react-dom só pode ser
// importado DEPOIS de window/document existirem (detecta DOM na carga).
const globals = globalThis as unknown as Record<string, unknown>;
let createRoot: typeof import("react-dom/client").createRoot;
let dom: JSDOM;

const settings = (overrides: Partial<BroadcastPlaylistSlideshow> = {}): BroadcastPlaylistSlideshow => ({
  motion: "none",
  motionStrength: "medium",
  transition: "none",
  transitionMs: 700,
  ...overrides,
});

const slideA: ImageSlideInfo = { key: "a", itemId: "item-a", durationSeconds: 10 };
const slideB: ImageSlideInfo = { key: "b", itemId: "item-b", durationSeconds: 10 };

let container: HTMLDivElement;
let root: Root;

function render(slide: ImageSlideInfo, config: BroadcastPlaylistSlideshow, options: { single?: boolean; frozen?: boolean } = {}) {
  act(() => {
    root.render(
      createElement(
        FreezeContext.Provider,
        { value: options.frozen ?? false },
        createElement(ImageSlideStack, {
          slide,
          settings: config,
          objectFitClassName: "object-contain",
          showBlurFill: false,
          single: options.single ?? false,
        }),
      ),
    );
  });
}

// Imagens "da frente" (a de fundo borrado está desligada nestes testes).
const frontImages = () => Array.from(container.querySelectorAll("img"));

beforeAll(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  globals.window = dom.window;
  globals.document = dom.window.document;
  Object.defineProperty(globalThis, "navigator", { value: dom.window.navigator, configurable: true });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  ({ createRoot } = await import("react-dom/client"));
});

afterAll(() => {
  dom.window.close();
  for (const key of ["window", "document", "navigator", "IS_REACT_ACT_ENVIRONMENT"]) delete globals[key];
  // navigator nativo do Node volta sozinho ao apagar a propriedade definida acima.
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

describe("ImageSlideStack", () => {
  it("shows only the current image and never keeps the previous one with transition 'none' (legacy hard cut)", () => {
    render(slideA, settings());
    expect(frontImages()).toHaveLength(1);

    render(slideB, settings());
    expect(frontImages()).toHaveLength(1);
    expect(frontImages()[0].getAttribute("src")).toBe("/api/broadcast/stream/item-b");
    // Nada de animação no wrapper nem no <img>: comportamento idêntico ao de antes da v1.10.
    expect((frontImages()[0].parentElement as HTMLElement).style.animationName).toBe("");
    expect(frontImages()[0].style.animationName).toBe("");
  });

  it("keeps the previous image underneath during a fade and removes it after the transition", () => {
    const config = settings({ transition: "fade", transitionMs: 700 });
    render(slideA, config);
    render(slideB, config);

    const images = frontImages();
    expect(images.map((image) => image.getAttribute("src"))).toEqual([
      "/api/broadcast/stream/item-a", // saindo, por baixo
      "/api/broadcast/stream/item-b", // entrando, por cima
    ]);
    const incomingWrapper = images[1].parentElement as HTMLElement;
    expect(incomingWrapper.style.animationName).toBe("broadcast-slide-enter-fade");
    expect(incomingWrapper.style.animationDuration).toBe("700ms");
    expect(Number(incomingWrapper.style.zIndex)).toBeGreaterThan(Number((images[0].parentElement as HTMLElement).style.zIndex));

    act(() => {
      vi.advanceTimersByTime(700 + 200);
    });
    expect(frontImages().map((image) => image.getAttribute("src"))).toEqual(["/api/broadcast/stream/item-b"]);
  });

  it("pushes the outgoing image out with the 'slide' transition", () => {
    const config = settings({ transition: "slide" });
    render(slideA, config);
    render(slideB, config);

    const [outgoing, incoming] = frontImages();
    expect((outgoing.parentElement as HTMLElement).style.animationName).toBe("broadcast-slide-leave-slide");
    expect((incoming.parentElement as HTMLElement).style.animationName).toBe("broadcast-slide-enter-slide");
  });

  it("does not create a leaving image when the same slide re-renders (state refetch)", () => {
    const config = settings({ transition: "fade" });
    render(slideA, config);
    render({ ...slideA }, config);
    expect(frontImages()).toHaveLength(1);
  });

  it("applies the Ken Burns motion on the <img> with a duration that covers display time + transition overlap", () => {
    render(slideA, settings({ motion: "zoom-in", motionStrength: "medium", transitionMs: 700 }));
    const style = frontImages()[0].style;
    expect(style.animationName).toBe("broadcast-slide-motion");
    expect(style.animationDuration).toBe("10700ms");
    expect(style.getPropertyValue("--kb-from")).toBe("translate3d(0%, 0%, 0) scale(1)");
    expect(style.getPropertyValue("--kb-to")).toBe("translate3d(0%, 0%, 0) scale(1.12)");
    expect(style.animationIterationCount).toBe("1");
    expect(style.animationDirection).toBe("normal");
  });

  it("loops the motion back and forth when the playlist has a single image", () => {
    render(slideA, settings({ motion: "pan-left" }), { single: true });
    expect(frontImages()[0].style.animationIterationCount).toBe("infinite");
    expect(frontImages()[0].style.animationDirection).toBe("alternate");
  });

  it("pauses the animations while the screen is frozen", () => {
    render(slideA, settings({ motion: "zoom-in", transition: "fade" }), { frozen: true });
    expect(frontImages()[0].style.animationPlayState).toBe("paused");
    expect((frontImages()[0].parentElement as HTMLElement).style.animationPlayState).toBe("paused");
  });
});
