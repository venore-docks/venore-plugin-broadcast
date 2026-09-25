import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@venore/plugin-sdk/observability", () => ({
  beginOperation: vi.fn(() => ({ operationId: "op-1", useCase: "test", actor: { id: "actor-1", type: "user" }, kind: "write", startedAt: new Date() })),
  endOperation: vi.fn(),
}));

const publishOutputEvent = vi.fn();
vi.mock("../../../runtime/output-bus", () => ({
  publishOutputEvent: (...args: unknown[]) => publishOutputEvent(...args),
}));

const findOutputById = vi.fn();
const applyOutputLiveStreamCaptions = vi.fn();
vi.mock("./store", () => ({
  findOutputById: (...args: unknown[]) => findOutputById(...args),
  applyOutputLiveStreamCaptions: (...args: unknown[]) => applyOutputLiveStreamCaptions(...args),
}));

describe("setOutputLiveStreamCaptions", () => {
  beforeEach(() => {
    findOutputById.mockReset();
    applyOutputLiveStreamCaptions.mockReset();
    publishOutputEvent.mockReset();
  });

  it("fails when the output does not exist", async () => {
    findOutputById.mockResolvedValue(null);
    const { setOutputLiveStreamCaptions } = await import("./service");

    const result = await setOutputLiveStreamCaptions({ outputId: "missing", captions: true, actorId: "actor-1" });

    expect(result).toMatchObject({ success: false, error: { code: "broadcast.set-output-live-stream-captions.not_found" } });
    expect(applyOutputLiveStreamCaptions).not.toHaveBeenCalled();
    expect(publishOutputEvent).not.toHaveBeenCalled();
  });

  it("updates the flag and notifies only that screen", async () => {
    findOutputById.mockResolvedValue({ id: "o1", token: "recepcao" });
    applyOutputLiveStreamCaptions.mockResolvedValue({ id: "o1", liveStreamCaptions: true });
    const { setOutputLiveStreamCaptions } = await import("./service");

    const result = await setOutputLiveStreamCaptions({ outputId: "o1", captions: true, actorId: "actor-1" });

    expect(result.success).toBe(true);
    expect(applyOutputLiveStreamCaptions).toHaveBeenCalledWith("o1", true);
    expect(publishOutputEvent).toHaveBeenCalledWith("recepcao", { type: "live-stream-captions-changed", captions: true });
  });
});
