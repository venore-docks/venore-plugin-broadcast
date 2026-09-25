import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeActor = vi.fn();
vi.mock("@venore/plugin-sdk/rbac", () => ({
  authorizeActor: (...args: unknown[]) => authorizeActor(...args),
}));

const startLiveStream = vi.fn();
vi.mock("./service", () => ({
  startLiveStream: (...args: unknown[]) => startLiveStream(...args),
}));

const forbidden = { authorized: false as const, error: { code: "rbac.authorization.forbidden", message: "forbidden" } };
const input = { url: "https://www.youtube.com/live/dQw4w9WgXcQ", outputIds: ["o1"] };

describe("startLiveStreamHandler", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    startLiveStream.mockReset();
    startLiveStream.mockResolvedValue({ success: true, data: { id: "ls-1" } });
  });

  it("explains that a channel link is not a stream link, before authorization", async () => {
    const { startLiveStreamHandler } = await import("./handler");

    const result = await startLiveStreamHandler({ ...input, url: "https://www.youtube.com/@canal/live" });

    expect(result).toMatchObject({ success: false, error: { code: "broadcast.start-live-stream.channel_url" } });
    expect(authorizeActor).not.toHaveBeenCalled();
  });

  it("requires at least one screen", async () => {
    const { startLiveStreamHandler } = await import("./handler");

    const result = await startLiveStreamHandler({ ...input, outputIds: [] });

    expect(result).toMatchObject({ success: false, error: { code: "broadcast.start-live-stream.no_outputs" } });
    expect(startLiveStream).not.toHaveBeenCalled();
  });

  it("requires broadcast.manage", async () => {
    authorizeActor.mockResolvedValue(forbidden);
    const { startLiveStreamHandler } = await import("./handler");

    const result = await startLiveStreamHandler(input);

    expect(authorizeActor).toHaveBeenCalledWith("broadcast.manage");
    expect(result).toEqual({ success: false, error: forbidden.error });
    expect(startLiveStream).not.toHaveBeenCalled();
  });

  it("delegates to the service with the actor id", async () => {
    authorizeActor.mockResolvedValue({ authorized: true, actorId: "actor-1" });
    const { startLiveStreamHandler } = await import("./handler");

    const result = await startLiveStreamHandler(input);

    expect(result.success).toBe(true);
    expect(startLiveStream).toHaveBeenCalledWith({ ...input, actorId: "actor-1" });
  });
});
