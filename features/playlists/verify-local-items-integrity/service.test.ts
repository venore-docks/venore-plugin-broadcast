import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BROADCAST_ROOT_FOLDER } from "../../../shared/settings";

const stat = vi.fn();
vi.mock("node:fs/promises", () => ({
  stat: (...args: unknown[]) => stat(...args),
}));

const computeFileSha256 = vi.fn();
vi.mock("../../../shared/file-integrity", () => ({
  computeFileSha256: (...args: unknown[]) => computeFileSha256(...args),
}));

const findLocalItemsWithRecordedIntegrity = vi.fn();
vi.mock("./store", () => ({
  findLocalItemsWithRecordedIntegrity: (...args: unknown[]) => findLocalItemsWithRecordedIntegrity(...args),
}));

const ROOT = path.resolve(BROADCAST_ROOT_FOLDER);

function row(overrides: Partial<{ itemId: string; relativePath: string; fileSizeBytes: number; fileSha256: string }> = {}) {
  return {
    itemId: "item-1",
    playlistId: "playlist-1",
    playlistName: "Recepção",
    title: "Vídeo institucional",
    relativePath: "videos/intro.mp4",
    fileSizeBytes: 1000,
    fileSha256: "aaa111",
    ...overrides,
  };
}

describe("verifyLocalItemsIntegrity", () => {
  beforeEach(() => {
    stat.mockReset();
    computeFileSha256.mockReset();
    findLocalItemsWithRecordedIntegrity.mockReset();
  });

  it("reports no issues when the file still matches the recorded size and hash", async () => {
    findLocalItemsWithRecordedIntegrity.mockResolvedValue([row()]);
    stat.mockResolvedValue({ size: 1000 });
    computeFileSha256.mockResolvedValue("aaa111");

    const { verifyLocalItemsIntegrity } = await import("./service");
    const result = await verifyLocalItemsIntegrity();

    expect(result).toEqual({ success: true, data: [] });
  });

  it("flags a mismatch when the hash differs even though the size stayed the same", async () => {
    findLocalItemsWithRecordedIntegrity.mockResolvedValue([row()]);
    stat.mockResolvedValue({ size: 1000 });
    computeFileSha256.mockResolvedValue("different-hash");

    const { verifyLocalItemsIntegrity } = await import("./service");
    const result = await verifyLocalItemsIntegrity();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual([
      expect.objectContaining({ itemId: "item-1", status: "mismatch", recordedSizeBytes: 1000, currentSizeBytes: 1000 }),
    ]);
  });

  it("flags a mismatch when the size differs", async () => {
    findLocalItemsWithRecordedIntegrity.mockResolvedValue([row()]);
    stat.mockResolvedValue({ size: 2000 });
    computeFileSha256.mockResolvedValue("aaa111");

    const { verifyLocalItemsIntegrity } = await import("./service");
    const result = await verifyLocalItemsIntegrity();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]).toEqual(expect.objectContaining({ status: "mismatch", currentSizeBytes: 2000 }));
  });

  it("flags 'missing' when the file no longer exists on disk", async () => {
    findLocalItemsWithRecordedIntegrity.mockResolvedValue([row()]);
    stat.mockRejectedValue(new Error("ENOENT"));

    const { verifyLocalItemsIntegrity } = await import("./service");
    const result = await verifyLocalItemsIntegrity();

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data[0]).toEqual(expect.objectContaining({ status: "missing", currentSizeBytes: null }));
    expect(computeFileSha256).not.toHaveBeenCalled();
  });

  it("resolves the correct absolute path per item", async () => {
    findLocalItemsWithRecordedIntegrity.mockResolvedValue([row()]);
    stat.mockResolvedValue({ size: 1000 });
    computeFileSha256.mockResolvedValue("aaa111");

    const { verifyLocalItemsIntegrity } = await import("./service");
    await verifyLocalItemsIntegrity();

    expect(stat).toHaveBeenCalledWith(path.join(ROOT, "videos", "intro.mp4"));
  });
});
