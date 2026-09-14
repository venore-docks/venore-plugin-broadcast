import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@venore/plugin-sdk/observability", () => ({
  beginOperation: vi.fn(() => ({ operationId: "op-1", useCase: "test", actor: { id: "actor-1", type: "user" }, kind: "write", startedAt: new Date() })),
  endOperation: vi.fn(),
}));

const findContentChangeById = vi.fn();
const markContentChangeApproved = vi.fn();
const markContentChangeFailed = vi.fn();
vi.mock("../shared/store", () => ({
  findContentChangeById: (...args: unknown[]) => findContentChangeById(...args),
  markContentChangeApproved: (...args: unknown[]) => markContentChangeApproved(...args),
  markContentChangeFailed: (...args: unknown[]) => markContentChangeFailed(...args),
}));

const apply = vi.fn();
vi.mock("../shared/appliers", () => ({
  CONTENT_CHANGE_APPLIERS: { "broadcast.update-playlist-item": (...args: unknown[]) => apply(...args) },
}));

describe("approveContentChange", () => {
  beforeEach(() => {
    findContentChangeById.mockReset();
    markContentChangeApproved.mockReset();
    markContentChangeFailed.mockReset();
    apply.mockReset();
  });

  it("fails when the change does not exist", async () => {
    findContentChangeById.mockResolvedValue(null);

    const { approveContentChange } = await import("./service");
    const result = await approveContentChange({ changeId: "missing", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.approve-content-change.not_found");
  });

  it("fails when the change is no longer pending", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "approved" });

    const { approveContentChange } = await import("./service");
    const result = await approveContentChange({ changeId: "change-1", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.approve-content-change.not_pending");
    expect(apply).not.toHaveBeenCalled();
  });

  // Reaplica com o ator ORIGINAL (requestedBy) como autor do conteúdo — o aprovador (actorId do
  // command) vira decidedBy, não o autor do item.
  it("reapplies with the original requester as actor, and records the approver as decidedBy", async () => {
    findContentChangeById.mockResolvedValue({
      id: "change-1",
      status: "pending",
      useCase: "broadcast.update-playlist-item",
      targetId: "item-1",
      payload: { itemId: "item-1", title: "New" },
      requestedBy: "editor-1",
    });
    apply.mockResolvedValue({ success: true, data: { id: "item-1", title: "New" } });

    const { approveContentChange } = await import("./service");
    const result = await approveContentChange({ changeId: "change-1", actorId: "admin-1" });

    expect(apply).toHaveBeenCalledWith({ itemId: "item-1", title: "New", actorId: "editor-1" });
    expect(markContentChangeApproved).toHaveBeenCalledWith("change-1", {
      decidedBy: "admin-1",
      resultSnapshot: { id: "item-1", title: "New" },
      targetId: "item-1",
    });
    expect(result).toEqual({ success: true, data: { id: "change-1" } });
  });

  it("backfills targetId from the result when the change was a creation (targetId null)", async () => {
    findContentChangeById.mockResolvedValue({
      id: "change-1",
      status: "pending",
      useCase: "broadcast.update-playlist-item",
      targetId: null,
      payload: {},
      requestedBy: "editor-1",
    });
    apply.mockResolvedValue({ success: true, data: { id: "new-item-1" } });

    const { approveContentChange } = await import("./service");
    await approveContentChange({ changeId: "change-1", actorId: "admin-1" });

    expect(markContentChangeApproved).toHaveBeenCalledWith("change-1", expect.objectContaining({ targetId: "new-item-1" }));
  });

  // Alvo obsoleto (ex: item apagado enquanto a aprovação esperava) — vira failed, não trava a fila.
  it("marks the change as failed (not lost) when applying fails", async () => {
    findContentChangeById.mockResolvedValue({
      id: "change-1",
      status: "pending",
      useCase: "broadcast.update-playlist-item",
      targetId: "item-1",
      payload: { itemId: "item-1" },
      requestedBy: "editor-1",
    });
    apply.mockResolvedValue({ success: false, error: { code: "broadcast.update-playlist-item.not_found", message: "Item não encontrado." } });

    const { approveContentChange } = await import("./service");
    const result = await approveContentChange({ changeId: "change-1", actorId: "admin-1" });

    expect(markContentChangeFailed).toHaveBeenCalledWith("change-1", "Item não encontrado.");
    expect(markContentChangeApproved).not.toHaveBeenCalled();
    expect(result.success).toBe(false);
  });

  it("fails gracefully for an unknown useCase (defensive, should not happen)", async () => {
    findContentChangeById.mockResolvedValue({ id: "change-1", status: "pending", useCase: "broadcast.unknown-thing", payload: {} });

    const { approveContentChange } = await import("./service");
    const result = await approveContentChange({ changeId: "change-1", actorId: "admin-1" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.approve-content-change.unknown_use_case");
  });
});
