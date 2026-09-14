import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BROADCAST_ROOT_FOLDER } from "../../../shared/settings";

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

const stat = vi.fn();
vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => stat(...args),
}));

const computeFileSha256 = vi.fn();
vi.mock("../../../shared/file-integrity", () => ({
  computeFileSha256: (...args: unknown[]) => computeFileSha256(...args),
}));

const findPlaylistById = vi.fn();
const findMaxPlaylistItemOrder = vi.fn();
const insertLocalPlaylistItem = vi.fn();
vi.mock("./store", () => ({
  findPlaylistById: (...args: unknown[]) => findPlaylistById(...args),
  findMaxPlaylistItemOrder: (...args: unknown[]) => findMaxPlaylistItemOrder(...args),
  insertLocalPlaylistItem: (...args: unknown[]) => insertLocalPlaylistItem(...args),
}));

const ROOT = path.resolve(BROADCAST_ROOT_FOLDER);

describe("uploadLocalVideo", () => {
  beforeEach(() => {
    stat.mockReset();
    computeFileSha256.mockReset();
    findPlaylistById.mockReset();
    findMaxPlaylistItemOrder.mockReset();
    insertLocalPlaylistItem.mockReset();
  });

  it("fails when the playlist has no folder configured", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: null });

    const { uploadLocalVideo } = await import("./service");
    const result = await uploadLocalVideo({ playlistId: "p1", relativePath: "videos/a.mp4", title: null, actorId: "actor-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.upload-local-video.invalid_playlist");
  });

  it("fails when the relativePath is outside the playlist's folder", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "videos" });

    const { uploadLocalVideo } = await import("./service");
    const result = await uploadLocalVideo({ playlistId: "p1", relativePath: "other/a.mp4", title: null, actorId: "actor-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.upload-local-video.invalid_path");
    expect(insertLocalPlaylistItem).not.toHaveBeenCalled();
  });

  it("fails when the file is no longer on disk (e.g. deleted while a pending approval waited)", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "videos" });
    stat.mockRejectedValue(new Error("ENOENT"));

    const { uploadLocalVideo } = await import("./service");
    const result = await uploadLocalVideo({ playlistId: "p1", relativePath: "videos/a.mp4", title: null, actorId: "actor-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.upload-local-video.file_missing");
    expect(insertLocalPlaylistItem).not.toHaveBeenCalled();
  });

  it("hashes the file and inserts the item with fileSizeBytes/fileSha256", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "videos" });
    findMaxPlaylistItemOrder.mockResolvedValue(2);
    stat.mockImplementation(async (target: string) => {
      if (target === path.join(ROOT, "videos", "a.mp4")) return { size: 999 };
      throw new Error("ENOENT");
    });
    computeFileSha256.mockResolvedValue("abc123");
    insertLocalPlaylistItem.mockResolvedValue({ id: "item-1", relativePath: "videos/a.mp4" });

    const { uploadLocalVideo } = await import("./service");
    const result = await uploadLocalVideo({ playlistId: "p1", relativePath: "videos/a.mp4", title: "Título", actorId: "actor-1" });

    expect(result.success).toBe(true);
    expect(insertLocalPlaylistItem).toHaveBeenCalledWith({
      playlistId: "p1",
      order: 3,
      title: "Título",
      relativePath: "videos/a.mp4",
      fileSizeBytes: 999,
      fileSha256: "abc123",
    });
  });
});
