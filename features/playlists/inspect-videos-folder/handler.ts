import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { inspectVideosFolder } from "./service";
import type { InspectVideosFolderResult } from "./types";

// broadcast.manage OU broadcast.playlists.manage (as duas permissions são distintas, daí o OR) —
// mesmo racional do check-webpage-embeddable: leitura genérica, não escrita num recurso.
export async function inspectVideosFolderHandler(): Promise<InspectVideosFolderResult> {
  const full = await authorizeActor("broadcast.manage");
  if (full.authorized) return inspectVideosFolder();

  const scoped = await authorizeActor("broadcast.playlists.manage");
  if (scoped.authorized) return inspectVideosFolder();

  return { success: false, error: scoped.error };
}
