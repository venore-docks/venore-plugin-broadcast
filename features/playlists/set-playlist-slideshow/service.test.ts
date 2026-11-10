import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@venore/plugin-sdk/observability", () => ({
  beginOperation: vi.fn(() => ({
    operationId: "op-1",
    useCase: "test",
    actor: { id: "actor-1", type: "user" },
    kind: "write",
    startedAt: new Date(),
  })),
  endOperation: vi.fn(),
}));

const findPlaylistById = vi.fn();
const applyPlaylistSlideshow = vi.fn();
vi.mock("./store", () => ({
  findPlaylistById: (...args: unknown[]) => findPlaylistById(...args),
  applyPlaylistSlideshow: (...args: unknown[]) => applyPlaylistSlideshow(...args),
}));

const slideshow = { motion: "zoom-in", motionStrength: "soft", transition: "fade", transitionMs: 600 } as const;

describe("setPlaylistSlideshow", () => {
  beforeEach(() => {
    findPlaylistById.mockReset();
    applyPlaylistSlideshow.mockReset();
  });

  it("returns not_found without writing when the playlist does not exist", async () => {
    findPlaylistById.mockResolvedValue(null);
    const { setPlaylistSlideshow } = await import("./service");

    const result = await setPlaylistSlideshow({ playlistId: "gone", slideshow, actorId: "actor-1" });

    expect(result).toEqual({
      success: false,
      error: { code: "broadcast.set-playlist-slideshow.not_found", message: "Playlist não encontrada." },
    });
    expect(applyPlaylistSlideshow).not.toHaveBeenCalled();
  });

  it("persists the slideshow and returns the updated playlist", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1" });
    applyPlaylistSlideshow.mockResolvedValue({ id: "p1", slideshowMotion: "zoom-in" });
    const { setPlaylistSlideshow } = await import("./service");

    const result = await setPlaylistSlideshow({ playlistId: "p1", slideshow, actorId: "actor-1" });

    expect(applyPlaylistSlideshow).toHaveBeenCalledWith("p1", slideshow);
    expect(result).toEqual({ success: true, data: { id: "p1", slideshowMotion: "zoom-in" } });
  });
});
