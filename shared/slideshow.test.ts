import { describe, expect, it } from "vitest";
import {
  DEFAULT_PLAYLIST_SLIDESHOW,
  SLIDESHOW_DEFAULT_TRANSITION_MS,
  buildSlideMotion,
  clampTransitionMs,
  normalizeSlideshow,
  parseSlideshowInput,
  resolveConcreteMotion,
  resolveConcreteTransition,
  slideMotionDurationMs,
} from "./slideshow";

describe("normalizeSlideshow", () => {
  it("falls back to the legacy look (no motion, hard cut) for an empty/old row", () => {
    expect(normalizeSlideshow({})).toEqual(DEFAULT_PLAYLIST_SLIDESHOW);
    expect(DEFAULT_PLAYLIST_SLIDESHOW.motion).toBe("none");
    expect(DEFAULT_PLAYLIST_SLIDESHOW.transition).toBe("none");
  });

  it("ignores unknown values and clamps the duration", () => {
    expect(
      normalizeSlideshow({
        slideshowMotion: "spin",
        slideshowMotionStrength: "huge",
        slideshowTransition: "explode",
        slideshowTransitionMs: 999999,
      }),
    ).toEqual({ ...DEFAULT_PLAYLIST_SLIDESHOW, transitionMs: 3000 });
  });

  it("keeps valid values", () => {
    expect(
      normalizeSlideshow({
        slideshowMotion: "pan-left",
        slideshowMotionStrength: "strong",
        slideshowTransition: "wipe",
        slideshowTransitionMs: 1200,
      }),
    ).toEqual({ motion: "pan-left", motionStrength: "strong", transition: "wipe", transitionMs: 1200 });
  });
});

describe("clampTransitionMs", () => {
  it("clamps and rounds", () => {
    expect(clampTransitionMs(50)).toBe(200);
    expect(clampTransitionMs(5000)).toBe(3000);
    expect(clampTransitionMs(700.4)).toBe(700);
    expect(clampTransitionMs(Number.NaN)).toBe(SLIDESHOW_DEFAULT_TRANSITION_MS);
  });
});

describe("mix resolution", () => {
  it("is deterministic per item (same item → same effect on every TV)", () => {
    expect(resolveConcreteMotion("mix", "item-a")).toBe(resolveConcreteMotion("mix", "item-a"));
    expect(resolveConcreteTransition("mix", "item-a")).toBe(resolveConcreteTransition("mix", "item-a"));
  });

  it("never resolves to mix/none, and varies across items", () => {
    const motions = new Set<string>();
    const transitions = new Set<string>();
    for (let i = 0; i < 40; i += 1) {
      motions.add(resolveConcreteMotion("mix", `item-${i}`));
      transitions.add(resolveConcreteTransition("mix", `item-${i}`));
    }
    expect(motions.has("mix")).toBe(false);
    expect(motions.has("none")).toBe(false);
    expect(transitions.has("mix")).toBe(false);
    expect(transitions.has("none")).toBe(false);
    expect(motions.size).toBeGreaterThan(2);
    expect(transitions.size).toBeGreaterThan(1);
  });

  it("passes non-mix values through", () => {
    expect(resolveConcreteMotion("zoom-in", "x")).toBe("zoom-in");
    expect(resolveConcreteTransition("fade", "x")).toBe("fade");
    expect(resolveConcreteTransition("none", "x")).toBe("none");
  });
});

describe("buildSlideMotion", () => {
  it("returns null for none", () => {
    expect(buildSlideMotion("none", "medium", "x")).toBeNull();
  });

  it("zoom-in grows from 1 to 1+delta; zoom-out is the reverse", () => {
    expect(buildSlideMotion("zoom-in", "medium", "x")).toEqual({
      fromTransform: "translate3d(0%, 0%, 0) scale(1)",
      toTransform: "translate3d(0%, 0%, 0) scale(1.12)",
    });
    expect(buildSlideMotion("zoom-out", "medium", "x")).toEqual({
      fromTransform: "translate3d(0%, 0%, 0) scale(1.12)",
      toTransform: "translate3d(0%, 0%, 0) scale(1)",
    });
  });

  it("pan keeps scale above 1 and never shifts more than the overscan", () => {
    const pan = buildSlideMotion("pan-left", "strong", "x");
    expect(pan).toEqual({
      fromTransform: "translate3d(10%, 0%, 0) scale(1.2)",
      toTransform: "translate3d(-10%, 0%, 0) scale(1.2)",
    });
  });

  it("scales the effect with the strength", () => {
    expect(buildSlideMotion("zoom-in", "soft", "x")?.toTransform).toContain("scale(1.06)");
    expect(buildSlideMotion("zoom-in", "strong", "x")?.toTransform).toContain("scale(1.2)");
  });
});

describe("slideMotionDurationMs", () => {
  it("covers the display time plus the transition overlap", () => {
    expect(slideMotionDurationMs(15, 700)).toBe(15700);
  });
});

describe("parseSlideshowInput", () => {
  const valid = { motion: "mix", motionStrength: "soft", transition: "fade", transitionMs: 600 };

  it("accepts a valid config (numeric string duration from a form)", () => {
    expect(parseSlideshowInput({ ...valid, transitionMs: "600" })).toEqual({
      ok: true,
      value: { motion: "mix", motionStrength: "soft", transition: "fade", transitionMs: 600 },
    });
  });

  it.each([
    [{ ...valid, motion: "spin" }, "motion"],
    [{ ...valid, motionStrength: "x" }, "motionStrength"],
    [{ ...valid, transition: "boom" }, "transition"],
    [{ ...valid, transitionMs: 100 }, "transitionMs"],
    [{ ...valid, transitionMs: 4000 }, "transitionMs"],
    [{ ...valid, transitionMs: "abc" }, "transitionMs"],
  ])("rejects %j", (input, field) => {
    const result = parseSlideshowInput(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.field).toBe(field);
  });
});
