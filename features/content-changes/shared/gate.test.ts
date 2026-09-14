import { beforeEach, describe, expect, it, vi } from "vitest";

const insertContentChange = vi.fn();
const findPendingContentChangeForTarget = vi.fn();
vi.mock("./store", () => ({
  insertContentChange: (...args: unknown[]) => insertContentChange(...args),
  findPendingContentChangeForTarget: (...args: unknown[]) => findPendingContentChangeForTarget(...args),
}));

describe("runGatedMutation", () => {
  beforeEach(() => {
    insertContentChange.mockReset();
    findPendingContentChangeForTarget.mockReset();
  });

  it("applies immediately and logs an auto_approved change when isFullAccess is true", async () => {
    const apply = vi.fn().mockResolvedValue({ success: true, data: { id: "item-1", title: "New" } });
    const fetchPreviousSnapshot = vi.fn().mockResolvedValue({ id: "item-1", title: "Old" });
    insertContentChange.mockResolvedValue({ id: "change-1" });

    const { runGatedMutation } = await import("./gate");
    const result = await runGatedMutation({
      useCase: "broadcast.update-playlist-item",
      entityType: "playlist_item",
      isFullAccess: true,
      actorId: "admin-1",
      targetId: "item-1",
      playlistId: "playlist-1",
      payload: { itemId: "item-1", title: "New" },
      fetchPreviousSnapshot,
      apply,
    });

    expect(apply).toHaveBeenCalledWith({ itemId: "item-1", title: "New" });
    expect(insertContentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: "broadcast.update-playlist-item",
        targetId: "item-1",
        playlistId: "playlist-1",
        previousSnapshot: { id: "item-1", title: "Old" },
        resultSnapshot: { id: "item-1", title: "New" },
        status: "auto_approved",
        requestedBy: "admin-1",
        decidedBy: "admin-1",
      }),
    );
    expect(result).toEqual({ success: true, pending: false, data: { id: "item-1", title: "New" } });
  });

  it("does not log a change when the immediate apply fails", async () => {
    const apply = vi.fn().mockResolvedValue({ success: false, error: { code: "x", message: "boom" } });

    const { runGatedMutation } = await import("./gate");
    const result = await runGatedMutation({
      useCase: "broadcast.update-playlist-item",
      entityType: "playlist_item",
      isFullAccess: true,
      actorId: "admin-1",
      targetId: "item-1",
      playlistId: "playlist-1",
      payload: {},
      apply,
    });

    expect(insertContentChange).not.toHaveBeenCalled();
    expect(result).toEqual({ success: false, pending: false, error: { code: "x", message: "boom" } });
  });

  it("infers targetId from the result when creating (targetId starts null)", async () => {
    const apply = vi.fn().mockResolvedValue({ success: true, data: { id: "new-item-1" } });
    insertContentChange.mockResolvedValue({ id: "change-1" });

    const { runGatedMutation } = await import("./gate");
    await runGatedMutation({
      useCase: "broadcast.add-webpage-playlist-item",
      entityType: "playlist_item",
      isFullAccess: true,
      actorId: "admin-1",
      targetId: null,
      playlistId: "playlist-1",
      payload: {},
      apply,
    });

    expect(insertContentChange).toHaveBeenCalledWith(expect.objectContaining({ targetId: "new-item-1" }));
  });

  it("queues a pending change instead of applying when isFullAccess is false", async () => {
    const apply = vi.fn();
    findPendingContentChangeForTarget.mockResolvedValue(null);
    insertContentChange.mockResolvedValue({ id: "change-1" });

    const { runGatedMutation } = await import("./gate");
    const result = await runGatedMutation({
      useCase: "broadcast.update-playlist-item",
      entityType: "playlist_item",
      isFullAccess: false,
      actorId: "editor-1",
      targetId: "item-1",
      playlistId: "playlist-1",
      payload: { itemId: "item-1" },
      apply,
    });

    expect(apply).not.toHaveBeenCalled();
    expect(insertContentChange).toHaveBeenCalledWith(
      expect.objectContaining({ status: "pending", requestedBy: "editor-1", decidedBy: null, decidedAt: null }),
    );
    expect(result).toEqual({ success: true, pending: true, changeId: "change-1" });
  });

  it("refuses a 2nd pending change on the same target+useCase", async () => {
    const apply = vi.fn();
    findPendingContentChangeForTarget.mockResolvedValue({ id: "existing-change" });

    const { runGatedMutation } = await import("./gate");
    const result = await runGatedMutation({
      useCase: "broadcast.update-playlist-item",
      entityType: "playlist_item",
      isFullAccess: false,
      actorId: "editor-1",
      targetId: "item-1",
      playlistId: "playlist-1",
      payload: {},
      apply,
    });

    expect(insertContentChange).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.content-changes.already_pending");
  });
});
