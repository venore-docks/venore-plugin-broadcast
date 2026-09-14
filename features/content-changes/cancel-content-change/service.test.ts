import { beforeEach, describe, expect, it, vi } from "vitest";

const findContentChangeById = vi.fn();
const markContentChangeCancelled = vi.fn();
vi.mock("../shared/store", () => ({
  findContentChangeById: (...args: unknown[]) => findContentChangeById(...args),
  markContentChangeCancelled: (...args: unknown[]) => markContentChangeCancelled(...args),
}));

describe("cancelContentChange", () => {
  beforeEach(() => {
    findContentChangeById.mockReset();
    markContentChangeCancelled.mockReset();
  });

  it("fails when the change does not exist", async () => {
    findContentChangeById.mockResolvedValue(null);

    const { cancelContentChange } = await import("./service");
    const result = await cancelContentChange({ changeId: "missing", actorId: "editor-1", isFullAccess: false });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.cancel-content-change.not_found");
  });

  it("fails when the change is no longer pending", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "approved", requestedBy: "editor-1" });

    const { cancelContentChange } = await import("./service");
    const result = await cancelContentChange({ changeId: "change-1", actorId: "editor-1", isFullAccess: false });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.cancel-content-change.not_pending");
  });

  it("refuses a scoped actor cancelling someone else's pending change", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "pending", requestedBy: "editor-1" });

    const { cancelContentChange } = await import("./service");
    const result = await cancelContentChange({ changeId: "change-1", actorId: "editor-2", isFullAccess: false });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.cancel-content-change.forbidden");
    expect(markContentChangeCancelled).not.toHaveBeenCalled();
  });

  it("lets the original requester cancel their own pending change", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "pending", requestedBy: "editor-1" });

    const { cancelContentChange } = await import("./service");
    const result = await cancelContentChange({ changeId: "change-1", actorId: "editor-1", isFullAccess: false });

    expect(markContentChangeCancelled).toHaveBeenCalledWith("change-1");
    expect(result).toEqual({ success: true, data: { id: "change-1" } });
  });

  it("lets a full-access actor cancel someone else's pending change", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "pending", requestedBy: "editor-1" });

    const { cancelContentChange } = await import("./service");
    const result = await cancelContentChange({ changeId: "change-1", actorId: "admin-1", isFullAccess: true });

    expect(markContentChangeCancelled).toHaveBeenCalledWith("change-1");
    expect(result).toEqual({ success: true, data: { id: "change-1" } });
  });
});
