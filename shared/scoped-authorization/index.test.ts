import { beforeEach, describe, expect, it, vi } from "vitest";

const authorizeActor = vi.fn();
vi.mock("@venore/plugin-sdk/rbac", () => ({
  authorizeActor: (...args: unknown[]) => authorizeActor(...args),
}));

const isUserAssignedToAgenda = vi.fn();
const isUserAssignedToOutput = vi.fn();
const isUserAssignedToPlaylist = vi.fn();
const findAgendaIdByEventId = vi.fn();
const findPlaylistIdByItemId = vi.fn();
vi.mock("./store", () => ({
  isUserAssignedToAgenda: (...args: unknown[]) => isUserAssignedToAgenda(...args),
  isUserAssignedToOutput: (...args: unknown[]) => isUserAssignedToOutput(...args),
  isUserAssignedToPlaylist: (...args: unknown[]) => isUserAssignedToPlaylist(...args),
  findAgendaIdByEventId: (...args: unknown[]) => findAgendaIdByEventId(...args),
  findPlaylistIdByItemId: (...args: unknown[]) => findPlaylistIdByItemId(...args),
  findAgendaIdsAssignedToUser: vi.fn(),
  findOutputIdsAssignedToUser: vi.fn(),
  findPlaylistIdsAssignedToUser: vi.fn(),
}));

describe("authorizeAgendaActor", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    isUserAssignedToAgenda.mockReset();
  });

  it("authorizes immediately when the actor has broadcast.manage, without checking assignment", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.manage" ? { authorized: true, actorId: "admin-1" } : { authorized: false, error: {} },
    );

    const { authorizeAgendaActor } = await import("./index");
    const result = await authorizeAgendaActor("agenda-1");

    expect(result).toEqual({ authorized: true, actorId: "admin-1" });
    expect(isUserAssignedToAgenda).not.toHaveBeenCalled();
  });

  it("denies a scoped editor who is not assigned to the target agenda, even with broadcast.agenda.manage", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.agenda.manage"
        ? { authorized: true, actorId: "editor-1" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    isUserAssignedToAgenda.mockResolvedValue(false);

    const { authorizeAgendaActor } = await import("./index");
    const result = await authorizeAgendaActor("agenda-1");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.error.code).toBe("broadcast.agenda.forbidden_resource");
    expect(isUserAssignedToAgenda).toHaveBeenCalledWith("agenda-1", "editor-1");
  });

  it("authorizes a scoped editor who IS assigned to the target agenda", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.agenda.manage"
        ? { authorized: true, actorId: "editor-1" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    isUserAssignedToAgenda.mockResolvedValue(true);

    const { authorizeAgendaActor } = await import("./index");
    const result = await authorizeAgendaActor("agenda-1");

    expect(result).toEqual({ authorized: true, actorId: "editor-1" });
  });

  it("denies an actor with neither permission, without ever querying assignment", async () => {
    authorizeActor.mockResolvedValue({
      authorized: false,
      error: { code: "rbac.authorization.forbidden", message: "forbidden" },
    });

    const { authorizeAgendaActor } = await import("./index");
    const result = await authorizeAgendaActor("agenda-1");

    expect(result.authorized).toBe(false);
    expect(isUserAssignedToAgenda).not.toHaveBeenCalled();
  });
});

describe("authorizeAgendaEventActor", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    isUserAssignedToAgenda.mockReset();
    findAgendaIdByEventId.mockReset();
  });

  it("resolves the event's parent agenda before checking assignment", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.agenda.manage"
        ? { authorized: true, actorId: "editor-1" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    findAgendaIdByEventId.mockResolvedValue("agenda-1");
    isUserAssignedToAgenda.mockResolvedValue(true);

    const { authorizeAgendaEventActor } = await import("./index");
    const result = await authorizeAgendaEventActor("event-1");

    expect(findAgendaIdByEventId).toHaveBeenCalledWith("event-1");
    expect(isUserAssignedToAgenda).toHaveBeenCalledWith("agenda-1", "editor-1");
    expect(result).toEqual({ authorized: true, actorId: "editor-1" });
  });

  it("fails when the event does not exist", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.agenda.manage"
        ? { authorized: true, actorId: "editor-1" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    findAgendaIdByEventId.mockResolvedValue(null);

    const { authorizeAgendaEventActor } = await import("./index");
    const result = await authorizeAgendaEventActor("missing-event");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.error.code).toBe("broadcast.agenda.event_not_found");
  });
});

describe("authorizeOutputActor", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    isUserAssignedToOutput.mockReset();
  });

  it("denies a scoped editor who is not assigned to the target output", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.outputs.manage"
        ? { authorized: true, actorId: "editor-2" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    isUserAssignedToOutput.mockResolvedValue(false);

    const { authorizeOutputActor } = await import("./index");
    const result = await authorizeOutputActor("output-1");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.error.code).toBe("broadcast.outputs.forbidden_resource");
  });
});

describe("authorizePlaylistActor", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    isUserAssignedToPlaylist.mockReset();
  });

  it("authorizes immediately when the actor has broadcast.manage, without checking assignment, and reports isFullAccess", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.manage" ? { authorized: true, actorId: "admin-1" } : { authorized: false, error: {} },
    );

    const { authorizePlaylistActor } = await import("./index");
    const result = await authorizePlaylistActor("playlist-1");

    expect(result).toEqual({ authorized: true, actorId: "admin-1", isFullAccess: true });
    expect(isUserAssignedToPlaylist).not.toHaveBeenCalled();
  });

  it("denies a scoped editor who is not assigned to the target playlist, even with broadcast.playlists.manage", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.playlists.manage"
        ? { authorized: true, actorId: "editor-3" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    isUserAssignedToPlaylist.mockResolvedValue(false);

    const { authorizePlaylistActor } = await import("./index");
    const result = await authorizePlaylistActor("playlist-1");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.error.code).toBe("broadcast.playlists.forbidden_resource");
    expect(isUserAssignedToPlaylist).toHaveBeenCalledWith("playlist-1", "editor-3");
  });

  it("authorizes a scoped editor who IS assigned to the target playlist, with isFullAccess false", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.playlists.manage"
        ? { authorized: true, actorId: "editor-3" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    isUserAssignedToPlaylist.mockResolvedValue(true);

    const { authorizePlaylistActor } = await import("./index");
    const result = await authorizePlaylistActor("playlist-1");

    expect(result).toEqual({ authorized: true, actorId: "editor-3", isFullAccess: false });
  });
});

describe("authorizePlaylistItemActor", () => {
  beforeEach(() => {
    authorizeActor.mockReset();
    isUserAssignedToPlaylist.mockReset();
    findPlaylistIdByItemId.mockReset();
  });

  it("resolves the item's parent playlist before checking assignment, with isFullAccess false", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.playlists.manage"
        ? { authorized: true, actorId: "editor-3" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    findPlaylistIdByItemId.mockResolvedValue("playlist-1");
    isUserAssignedToPlaylist.mockResolvedValue(true);

    const { authorizePlaylistItemActor } = await import("./index");
    const result = await authorizePlaylistItemActor("item-1");

    expect(findPlaylistIdByItemId).toHaveBeenCalledWith("item-1");
    expect(isUserAssignedToPlaylist).toHaveBeenCalledWith("playlist-1", "editor-3");
    expect(result).toEqual({ authorized: true, actorId: "editor-3", isFullAccess: false, playlistId: "playlist-1" });
  });

  it("fails when the item does not exist", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.playlists.manage"
        ? { authorized: true, actorId: "editor-3" }
        : { authorized: false, error: { code: "rbac.authorization.forbidden", message: "forbidden" } },
    );
    findPlaylistIdByItemId.mockResolvedValue(null);

    const { authorizePlaylistItemActor } = await import("./index");
    const result = await authorizePlaylistItemActor("missing-item");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.error.code).toBe("broadcast.playlists.item_not_found");
  });

  it("resolves the item's parent playlist even for broadcast.manage, with isFullAccess true", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.manage" ? { authorized: true, actorId: "admin-1" } : { authorized: false, error: {} },
    );
    findPlaylistIdByItemId.mockResolvedValue("playlist-1");

    const { authorizePlaylistItemActor } = await import("./index");
    const result = await authorizePlaylistItemActor("item-1");

    expect(findPlaylistIdByItemId).toHaveBeenCalledWith("item-1");
    expect(isUserAssignedToPlaylist).not.toHaveBeenCalled();
    expect(result).toEqual({ authorized: true, actorId: "admin-1", isFullAccess: true, playlistId: "playlist-1" });
  });

  it("fails when the item does not exist, even for broadcast.manage", async () => {
    authorizeActor.mockImplementation(async (permission: string) =>
      permission === "broadcast.manage" ? { authorized: true, actorId: "admin-1" } : { authorized: false, error: {} },
    );
    findPlaylistIdByItemId.mockResolvedValue(null);

    const { authorizePlaylistItemActor } = await import("./index");
    const result = await authorizePlaylistItemActor("missing-item");

    expect(result.authorized).toBe(false);
    if (!result.authorized) expect(result.error.code).toBe("broadcast.playlists.item_not_found");
  });
});
