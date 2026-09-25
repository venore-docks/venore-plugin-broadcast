import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@venore/plugin-sdk/observability", () => ({
  beginOperation: vi.fn(() => ({ operationId: "op-1", useCase: "test", actor: { id: "actor-1", type: "user" }, kind: "write", startedAt: new Date() })),
  endOperation: vi.fn(),
}));

const publishOutputEvent = vi.fn();
vi.mock("../../../runtime/output-bus", () => ({
  publishOutputEvent: (...args: unknown[]) => publishOutputEvent(...args),
}));

const findOutputsOnLiveStream = vi.fn();
const clearLiveStreamFromOutputs = vi.fn();
vi.mock("./store", () => ({
  findOutputsOnLiveStream: (...args: unknown[]) => findOutputsOnLiveStream(...args),
  clearLiveStreamFromOutputs: (...args: unknown[]) => clearLiveStreamFromOutputs(...args),
}));

describe("stopLiveStream", () => {
  beforeEach(() => {
    publishOutputEvent.mockReset();
    findOutputsOnLiveStream.mockReset();
    clearLiveStreamFromOutputs.mockReset();
  });

  it("takes every screen off the stream when no screen is given", async () => {
    findOutputsOnLiveStream.mockResolvedValue([
      { id: "o1", token: "recepcao" },
      { id: "o2", token: "cantina" },
    ]);
    const { stopLiveStream } = await import("./service");

    const result = await stopLiveStream({ liveStreamId: "ls-1", outputId: null, actorId: "actor-1" });

    expect(result).toEqual({ success: true, data: { stopped: 2 } });
    expect(findOutputsOnLiveStream).toHaveBeenCalledWith("ls-1", null);
    expect(clearLiveStreamFromOutputs).toHaveBeenCalledWith(["o1", "o2"]);
    expect(publishOutputEvent).toHaveBeenCalledWith("recepcao", { type: "live-stream-changed" });
    expect(publishOutputEvent).toHaveBeenCalledWith("cantina", { type: "live-stream-changed" });
  });

  it("takes a single screen off, leaving the others on the stream", async () => {
    findOutputsOnLiveStream.mockResolvedValue([{ id: "o2", token: "cantina" }]);
    const { stopLiveStream } = await import("./service");

    await stopLiveStream({ liveStreamId: "ls-1", outputId: "o2", actorId: "actor-1" });

    expect(findOutputsOnLiveStream).toHaveBeenCalledWith("ls-1", "o2");
    expect(clearLiveStreamFromOutputs).toHaveBeenCalledWith(["o2"]);
    expect(publishOutputEvent).toHaveBeenCalledTimes(1);
  });

  it("fails when the stream is no longer on that screen", async () => {
    findOutputsOnLiveStream.mockResolvedValue([]);
    const { stopLiveStream } = await import("./service");

    const result = await stopLiveStream({ liveStreamId: "ls-1", outputId: "o9", actorId: "actor-1" });

    expect(result).toMatchObject({ success: false, error: { code: "broadcast.stop-live-stream.not_found" } });
    expect(clearLiveStreamFromOutputs).not.toHaveBeenCalled();
    expect(publishOutputEvent).not.toHaveBeenCalled();
  });
});
