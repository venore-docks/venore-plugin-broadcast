import { describe, expect, it } from "vitest";
import { validateAddWebpagePlaylistItemInput } from "./validation";

describe("validateAddWebpagePlaylistItemInput", () => {
  it("accepts an internal route", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "/cursos" })).toBeNull();
  });

  // Restrição a rota interna desbloqueada temporariamente em 2026-09-18 (ver shared/webpage-url.ts)
  // — URL absoluta http(s) volta a ser aceita.
  it("accepts an absolute https URL", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "https://example.com/painel" })).toBeNull();
  });

  it("rejects a protocol-relative URL", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "//example.com/painel" })?.code).toBe(
      "broadcast.add-webpage-playlist-item.invalid_url",
    );
  });

  it("accepts a positive duration", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "/cursos", durationSeconds: 20 })).toBeNull();
  });

  it("rejects a missing playlistId", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "", url: "/cursos" })?.code).toBe(
      "broadcast.add-webpage-playlist-item.invalid_playlist",
    );
  });

  it("rejects a malformed URL", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "not a url" })?.code).toBe(
      "broadcast.add-webpage-playlist-item.invalid_url",
    );
  });

  it("rejects a non-http(s) protocol", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "ftp://example.com" })?.code).toBe(
      "broadcast.add-webpage-playlist-item.invalid_url",
    );
  });

  it("rejects a zero or negative duration", () => {
    expect(validateAddWebpagePlaylistItemInput({ playlistId: "p1", url: "/cursos", durationSeconds: 0 })?.code).toBe(
      "broadcast.add-webpage-playlist-item.invalid_duration",
    );
  });
});
