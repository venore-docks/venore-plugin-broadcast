import { beforeEach, describe, expect, it, vi } from "vitest";

const findContentChangeById = vi.fn();
const markContentChangeRejected = vi.fn();
vi.mock("../shared/store", () => ({
  findContentChangeById: (...args: unknown[]) => findContentChangeById(...args),
  markContentChangeRejected: (...args: unknown[]) => markContentChangeRejected(...args),
}));

describe("rejectContentChange", () => {
  beforeEach(() => {
    findContentChangeById.mockReset();
    markContentChangeRejected.mockReset();
  });

  it("fails when the change does not exist", async () => {
    findContentChangeById.mockResolvedValue(null);

    const { rejectContentChange } = await import("./service");
    const result = await rejectContentChange({ changeId: "missing", reason: "no", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.reject-content-change.not_found");
  });

  it("fails when the change is no longer pending", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "cancelled" });

    const { rejectContentChange } = await import("./service");
    const result = await rejectContentChange({ changeId: "change-1", reason: "no", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.reject-content-change.not_pending");
    expect(markContentChangeRejected).not.toHaveBeenCalled();
  });

  it("rejects a pending change with the given reason, without applying anything", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "pending" });

    const { rejectContentChange } = await import("./service");
    const result = await rejectContentChange({ changeId: "change-1", reason: "conteúdo impróprio", actorId: "admin-1" });

    expect(markContentChangeRejected).toHaveBeenCalledWith("change-1", { decidedBy: "admin-1", reason: "conteúdo impróprio" });
    expect(result).toEqual({ success: true, data: { id: "change-1" } });
  });
});
