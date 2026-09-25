import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@venore/plugin-sdk/observability", () => ({
  beginOperation: vi.fn(() => ({ operationId: "op-1", useCase: "test", actor: { id: "actor-1", type: "user" }, kind: "write", startedAt: new Date() })),
  endOperation: vi.fn(),
}));

const publishOutputEvent = vi.fn();
vi.mock("../../../runtime/output-bus", () => ({
  publishOutputEvent: (...args: unknown[]) => publishOutputEvent(...args),
}));

const probeYouTubeVideo = vi.fn();
vi.mock("./probe", () => ({
  probeYouTubeVideo: (...args: unknown[]) => probeYouTubeVideo(...args),
}));

const findOutputsByIds = vi.fn();
const createLiveStreamOnOutputs = vi.fn();
vi.mock("./store", () => ({
  findOutputsByIds: (...args: unknown[]) => findOutputsByIds(...args),
  createLiveStreamOnOutputs: (...args: unknown[]) => createLiveStreamOnOutputs(...args),
}));

const ID = "dQw4w9WgXcQ";
const baseCommand = { url: `https://youtu.be/${ID}?si=abc`, outputIds: ["o1", "o2"], actorId: "actor-1" };

describe("startLiveStream", () => {
  beforeEach(() => {
    publishOutputEvent.mockReset();
    probeYouTubeVideo.mockReset();
    findOutputsByIds.mockReset();
    createLiveStreamOnOutputs.mockReset();
    findOutputsByIds.mockResolvedValue([
      { id: "o1", token: "recepcao" },
      { id: "o2", token: "cantina" },
    ]);
    probeYouTubeVideo.mockResolvedValue({ status: "ok", title: "Culto ao vivo" });
    createLiveStreamOnOutputs.mockImplementation(async (input: object) => ({ id: "ls-1", createdAt: new Date(), ...input }));
  });

  it("creates the stream with the validated id and notifies only the chosen screens", async () => {
    const { startLiveStream } = await import("./service");

    const result = await startLiveStream(baseCommand);

    expect(result.success).toBe(true);
    expect(createLiveStreamOnOutputs).toHaveBeenCalledWith(
      { videoId: ID, sourceUrl: baseCommand.url, title: "Culto ao vivo" },
      ["o1", "o2"],
    );
    expect(publishOutputEvent).toHaveBeenCalledTimes(2);
    expect(publishOutputEvent).toHaveBeenCalledWith("recepcao", { type: "live-stream-changed" });
    expect(publishOutputEvent).toHaveBeenCalledWith("cantina", { type: "live-stream-changed" });
  });

  it("dedupes repeated screen ids", async () => {
    const { startLiveStream } = await import("./service");

    await startLiveStream({ ...baseCommand, outputIds: ["o1", "o2", "o1"] });

    expect(findOutputsByIds).toHaveBeenCalledWith(["o1", "o2"]);
  });

  it("fails when one of the screens no longer exists", async () => {
    findOutputsByIds.mockResolvedValue([{ id: "o1", token: "recepcao" }]);
    const { startLiveStream } = await import("./service");

    const result = await startLiveStream(baseCommand);

    expect(result).toMatchObject({ success: false, error: { code: "broadcast.start-live-stream.output_not_found" } });
    expect(createLiveStreamOnOutputs).not.toHaveBeenCalled();
  });

  it.each([
    ["not-embeddable", "broadcast.start-live-stream.not_embeddable"],
    ["not-found", "broadcast.start-live-stream.not_found"],
  ])("refuses a video the YouTube probe reports as %s", async (status, code) => {
    probeYouTubeVideo.mockResolvedValue({ status });
    const { startLiveStream } = await import("./service");

    const result = await startLiveStream(baseCommand);

    expect(result).toMatchObject({ success: false, error: { code } });
    expect(createLiveStreamOnOutputs).not.toHaveBeenCalled();
    expect(publishOutputEvent).not.toHaveBeenCalled();
  });

  it("still starts (without title) when the probe can't reach YouTube", async () => {
    probeYouTubeVideo.mockResolvedValue({ status: "unknown" });
    const { startLiveStream } = await import("./service");

    const result = await startLiveStream(baseCommand);

    expect(result.success).toBe(true);
    expect(createLiveStreamOnOutputs).toHaveBeenCalledWith(expect.objectContaining({ title: null }), ["o1", "o2"]);
  });

  it("rejects a non-video link before touching the database", async () => {
    const { startLiveStream } = await import("./service");

    const result = await startLiveStream({ ...baseCommand, url: "https://vimeo.com/123" });

    expect(result).toMatchObject({ success: false, error: { code: "broadcast.start-live-stream.invalid_url" } });
    expect(findOutputsByIds).not.toHaveBeenCalled();
  });
});
