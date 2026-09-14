import { beforeEach, describe, expect, it, vi } from "vitest";

// Cobre os 3 estados do gate de escopo (via authorizePlaylistActor, ver shared/scoped-authorization)
// E o gate de aprovação de conteúdo (features/content-changes, v1.9): sem permission / com a
// permission estreita mas sem atribuição / com permission + atribuição (agora enfileira, não
// aplica) / com broadcast.manage (aplica na hora, auto_approved). Mocka @/contexts/rbac
// (authorizeActor), o store de escopo, o store de content-changes e o service; a validação de
// input roda de verdade.
const authorizeActor = vi.fn();
vi.mock("@venore/plugin-sdk/rbac", () => ({
  authorizeActor: (...args: unknown[]) => authorizeActor(...args),
}));

const isUserAssignedToPlaylist = vi.fn();
vi.mock("../../../shared/scoped-authorization/store", () => ({
  isUserAssignedToAgenda: vi.fn(),
  isUserAssignedToOutput: vi.fn(),
  isUserAssignedToPlaylist: (...args: unknown[]) => isUserAssignedToPlaylist(...args),
  findAgendaIdByEventId: vi.fn(),
  findPlaylistIdByItemId: vi.fn(),
  findAgendaIdsAssignedToUser: vi.fn(),
  findOutputIdsAssignedToUser: vi.fn(),
  findPlaylistIdsAssignedToUser: vi.fn(),
}));

const addMediaAssetPlaylistItem = vi.fn();
vi.mock("./service", () => ({
  addMediaAssetPlaylistItem: (...args: unknown[]) => addMediaAssetPlaylistItem(...args),
}));

const insertContentChange = vi.fn();
const findPendingContentChangeForTarget = vi.fn();
vi.mock("../../content-changes/shared/store", () => ({
  insertContentChange: (...args: unknown[]) => insertContentChange(...args),
  findPendingContentChangeForTarget: (...args: unknown[]) => findPendingContentChangeForTarget(...args),
}));

const forbidden = { authorized: false as const, error: { code: "rbac.authorization.forbidden", message: "forbidden" } };
const input = { playlistId: "playlist-1", mediaAssetId: "asset-1" };

describe("addMediaAssetPlaylistItemHandler", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    isUserAssignedToPlaylist.mockReset();
    addMediaAssetPlaylistItem.mockReset();
    insertContentChange.mockReset();
    findPendingContentChangeForTarget.mockReset();
  });

  it("fails validation before authorization when the media asset is missing", async () => {
    const { addMediaAssetPlaylistItemHandler } = await import("./handler");
    const result = await addMediaAssetPlaylistItemHandler({ playlistId: "playlist-1", mediaAssetId: "" });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.add-media-asset-playlist-item.invalid_media");
    expect(authorizeActor).not.toHaveBeenCalled();
  });

  it("rejects an actor with neither broadcast.manage nor broadcast.playlists.manage, without touching the service", async () => {
    authorizeActor.mockResolvedValue(forbidden);

    const { addMediaAssetPlaylistItemHandler } = await import("./handler");
    const result = await addMediaAssetPlaylistItemHandler(input);

    expect(result).toEqual({ success: false, pending: false, error: forbidden.error });
    expect(isUserAssignedToPlaylist).not.toHaveBeenCalled();
    expect(addMediaAssetPlaylistItem).not.toHaveBeenCalled();
  });

  it("rejects a scoped editor (broadcast.playlists.manage) who is NOT assigned to the playlist", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.playlists.manage" ? { authorized: true, actorId: "editor-2" } : forbidden,
    );
    isUserAssignedToPlaylist.mockResolvedValue(false);

    const { addMediaAssetPlaylistItemHandler } = await import("./handler");
    const result = await addMediaAssetPlaylistItemHandler(input);

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("broadcast.playlists.forbidden_resource");
    expect(isUserAssignedToPlaylist).toHaveBeenCalledWith("playlist-1", "editor-2");
    expect(addMediaAssetPlaylistItem).not.toHaveBeenCalled();
  });

  // v1.9: um editor escopado (broadcast.playlists.manage, sem broadcast.manage) não aplica mais
  // direto — a proposta fica pending até um broadcast.manage aprovar (features/content-changes).
  it("queues a pending content change instead of applying, for a scoped editor assigned to the playlist", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.playlists.manage" ? { authorized: true, actorId: "editor-2" } : forbidden,
    );
    isUserAssignedToPlaylist.mockResolvedValue(true);
    findPendingContentChangeForTarget.mockResolvedValue(null);
    insertContentChange.mockResolvedValue({ id: "change-1" });

    const { addMediaAssetPlaylistItemHandler } = await import("./handler");
    const result = await addMediaAssetPlaylistItemHandler(input);

    expect(addMediaAssetPlaylistItem).not.toHaveBeenCalled();
    expect(insertContentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: "broadcast.add-media-asset-playlist-item",
        entityType: "playlist_item",
        targetId: null,
        playlistId: "playlist-1",
        payload: input,
        status: "pending",
        requestedBy: "editor-2",
        decidedBy: null,
      }),
    );
    expect(result).toEqual({ success: true, pending: true, changeId: "change-1" });
  });

  // broadcast.manage continua aplicando na hora (comportamento de antes do v1.9) — só que agora
  // também loga a mudança como auto_approved.
  it("applies immediately and logs an auto_approved change for an actor with broadcast.manage", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.manage" ? { authorized: true, actorId: "admin-1" } : forbidden,
    );
    addMediaAssetPlaylistItem.mockResolvedValue({ success: true, data: { id: "item-1" } });
    insertContentChange.mockResolvedValue({ id: "change-1" });

    const { addMediaAssetPlaylistItemHandler } = await import("./handler");
    const result = await addMediaAssetPlaylistItemHandler(input);

    expect(isUserAssignedToPlaylist).not.toHaveBeenCalled();
    expect(addMediaAssetPlaylistItem).toHaveBeenCalledWith({ playlistId: "playlist-1", mediaAssetId: "asset-1", actorId: "admin-1" });
    expect(insertContentChange).toHaveBeenCalledWith(
      expect.objectContaining({
        useCase: "broadcast.add-media-asset-playlist-item",
        status: "auto_approved",
        requestedBy: "admin-1",
        decidedBy: "admin-1",
        resultSnapshot: { id: "item-1" },
      }),
    );
    expect(result).toEqual({ success: true, pending: false, data: { id: "item-1" } });
  });
});
