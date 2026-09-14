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

const findLocalItemById = vi.fn();
const updateItemFileIntegrity = vi.fn();
vi.mock("./store", () => ({
  findLocalItemById: (...args: unknown[]) => findLocalItemById(...args),
  updateItemFileIntegrity: (...args: unknown[]) => updateItemFileIntegrity(...args),
}));

const ROOT = path.resolve(BROADCAST_ROOT_FOLDER);

describe("rebaselineLocalItemIntegrity", () => {
  beforeEach(() => {
    stat.mockReset();
    computeFileSha256.mockReset();
    findLocalItemById.mockReset();
    updateItemFileIntegrity.mockReset();
  });

  it("fails when the item does not exist", async () => {
    findLocalItemById.mockResolvedValue(null);

    const { rebaselineLocalItemIntegrity } = await import("./service");
    const result = await rebaselineLocalItemIntegrity({ itemId: "missing", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.rebaseline-local-item-integrity.not_found");
  });

  it("fails when the item is not sourceType local", async () => {
    findLocalItemById.mockResolvedValue({ id: "item-1", sourceType: "webpage", relativePath: null });

    const { rebaselineLocalItemIntegrity } = await import("./service");
    const result = await rebaselineLocalItemIntegrity({ itemId: "item-1", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.rebaseline-local-item-integrity.not_found");
  });

  it("fails when the file is no longer on disk", async () => {
    findLocalItemById.mockResolvedValue({ id: "item-1", sourceType: "local", relativePath: "videos/a.mp4" });
    stat.mockRejectedValue(new Error("ENOENT"));

    const { rebaselineLocalItemIntegrity } = await import("./service");
    const result = await rebaselineLocalItemIntegrity({ itemId: "item-1", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.rebaseline-local-item-integrity.file_missing");
    expect(updateItemFileIntegrity).not.toHaveBeenCalled();
  });

  it("re-hashes the current file and stores it as the new baseline", async () => {
    findLocalItemById.mockResolvedValue({ id: "item-1", sourceType: "local", relativePath: "videos/a.mp4" });
    stat.mockImplementation(async (target: string) => {
      if (target === path.join(ROOT, "videos", "a.mp4")) return { size: 555 };
      throw new Error("ENOENT");
    });
    computeFileSha256.mockResolvedValue("newhash");

    const { rebaselineLocalItemIntegrity } = await import("./service");
    const result = await rebaselineLocalItemIntegrity({ itemId: "item-1", actorId: "admin-1" });

    expect(updateItemFileIntegrity).toHaveBeenCalledWith("item-1", { fileSizeBytes: 555, fileSha256: "newhash" });
    expect(result).toEqual({ success: true, data: { id: "item-1", fileSizeBytes: 555, fileSha256: "newhash" } });
  });
});
