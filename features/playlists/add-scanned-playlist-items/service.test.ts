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
const insertLocalPlaylistItems = vi.fn();
vi.mock("./store", () => ({
  findPlaylistById: (...args: unknown[]) => findPlaylistById(...args),
  findMaxPlaylistItemOrder: (...args: unknown[]) => findMaxPlaylistItemOrder(...args),
  insertLocalPlaylistItems: (...args: unknown[]) => insertLocalPlaylistItems(...args),
}));

// BROADCAST_ROOT_FOLDER agora é uma constante fixa (não mais lida de contexts/settings), então o
// path absoluto esperado é sempre relativo ao process.cwd() do processo de teste.
const ROOT = path.resolve(BROADCAST_ROOT_FOLDER);

describe("addScannedPlaylistItems", () => {
  beforeEach(() => {
    stat.mockReset();
    computeFileSha256.mockReset();
    computeFileSha256.mockResolvedValue("deadbeef");
    findPlaylistById.mockReset();
    findMaxPlaylistItemOrder.mockReset();
    insertLocalPlaylistItems.mockReset();
  });

  it("fails when the playlist has no folder configured", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: null });

    const { addScannedPlaylistItems } = await import("./service");
    const result = await addScannedPlaylistItems({ playlistId: "p1", kind: "video", relativePaths: ["clips/a.mp4"], actorId: "actor-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.add-scanned-playlist-items.invalid_playlist");
    expect(insertLocalPlaylistItems).not.toHaveBeenCalled();
  });

  it("only inserts paths that are within the playlist's folder, have a video extension, and still exist on disk — hashing each valid file", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "clips" });
    findMaxPlaylistItemOrder.mockResolvedValue(0);
    stat.mockImplementation(async (target: string) => {
      if (target === path.join(ROOT, "clips", "intro.mp4")) return { isFile: () => true, size: 12345 };
      throw new Error("ENOENT");
    });
    insertLocalPlaylistItems.mockResolvedValue([{ id: "item-1", relativePath: "clips/intro.mp4" }]);

    const { addScannedPlaylistItems } = await import("./service");
    const result = await addScannedPlaylistItems({
      playlistId: "p1",
      kind: "video",
      relativePaths: [
        "clips/intro.mp4", // válido
        "clips/gone.mp4", // sumiu do disco (stat rejeita)
        "other-playlist/video.mp4", // fora da pasta desta playlist
        "clips/notes.txt", // extensão não é vídeo
      ],
      actorId: "actor-1",
    });

    expect(result.success).toBe(true);
    expect(computeFileSha256).toHaveBeenCalledTimes(1);
    expect(computeFileSha256).toHaveBeenCalledWith(path.join(ROOT, "clips", "intro.mp4"));
    expect(insertLocalPlaylistItems).toHaveBeenCalledWith([
      { playlistId: "p1", order: 1, title: null, relativePath: "clips/intro.mp4", fileSizeBytes: 12345, fileSha256: "deadbeef" },
    ]);
  });

  it("still matches when the playlist's folderPath has a trailing slash (real bug: 'videos/' rejected every valid path)", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "clips/" });
    findMaxPlaylistItemOrder.mockResolvedValue(0);
    stat.mockImplementation(async (target: string) => {
      if (target === path.join(ROOT, "clips", "intro.mp4")) return { isFile: () => true, size: 100 };
      throw new Error("ENOENT");
    });
    insertLocalPlaylistItems.mockResolvedValue([{ id: "item-1", relativePath: "clips/intro.mp4" }]);

    const { addScannedPlaylistItems } = await import("./service");
    const result = await addScannedPlaylistItems({ playlistId: "p1", kind: "video", relativePaths: ["clips/intro.mp4"], actorId: "actor-1" });

    expect(result.success).toBe(true);
    expect(insertLocalPlaylistItems).toHaveBeenCalledWith([
      { playlistId: "p1", order: 1, title: null, relativePath: "clips/intro.mp4", fileSizeBytes: 100, fileSha256: "deadbeef" },
    ]);
  });

  it("fails when none of the submitted paths are valid", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "clips" });
    stat.mockRejectedValue(new Error("ENOENT"));

    const { addScannedPlaylistItems } = await import("./service");
    const result = await addScannedPlaylistItems({ playlistId: "p1", kind: "video", relativePaths: ["clips/gone.mp4"], actorId: "actor-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.add-scanned-playlist-items.no_valid_items");
    expect(insertLocalPlaylistItems).not.toHaveBeenCalled();
    expect(computeFileSha256).not.toHaveBeenCalled();
  });

  // kind="image" nunca lê playlist.folderPath — usa BROADCAST_IMAGES_FOLDER_PATH direto, mesmo
  // quando a playlist só tem folderPath="videos" (o caso real de toda playlist hoje).
  it("kind image validates against BROADCAST_IMAGES_FOLDER_PATH regardless of playlist.folderPath", async () => {
    findPlaylistById.mockResolvedValue({ id: "p1", folderPath: "videos" });
    findMaxPlaylistItemOrder.mockResolvedValue(0);
    stat.mockImplementation(async (target: string) => {
      if (target === path.join(ROOT, "images", "banner.png")) return { isFile: () => true, size: 777 };
      throw new Error("ENOENT");
    });
    insertLocalPlaylistItems.mockResolvedValue([{ id: "item-1", relativePath: "images/banner.png" }]);

    const { addScannedPlaylistItems } = await import("./service");
    const result = await addScannedPlaylistItems({
      playlistId: "p1",
      kind: "image",
      relativePaths: [
        "images/banner.png", // válido
        "videos/intro.mp4", // fora da pasta de imagem
        "images/notes.txt", // extensão não é imagem
      ],
      actorId: "actor-1",
    });

    expect(result.success).toBe(true);
    expect(insertLocalPlaylistItems).toHaveBeenCalledWith([
      { playlistId: "p1", order: 1, title: null, relativePath: "images/banner.png", fileSizeBytes: 777, fileSha256: "deadbeef" },
    ]);
  });
});
