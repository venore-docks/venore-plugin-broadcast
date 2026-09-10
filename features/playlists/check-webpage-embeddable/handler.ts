import { authorizeActor } from "@venore/plugin-sdk/rbac";
import { checkWebpageEmbeddable } from "./service";
import type { CheckWebpageEmbeddableInput, CheckWebpageEmbeddableResult } from "./types";

// Só quem pode adicionar item de playlist de qualquer forma — broadcast.manage OU
// broadcast.playlists.manage (sem exigir atribuição a uma playlist específica: é uma checagem
// genérica de URL, não uma escrita num recurso). As duas permissions são distintas, daí o OR.
export async function checkWebpageEmbeddableHandler(
  input: CheckWebpageEmbeddableInput,
): Promise<CheckWebpageEmbeddableResult> {
  if (!input.url || !input.url.trim()) {
    return { success: false, error: { code: "broadcast.check-webpage-embeddable.invalid_url", message: "Informe uma URL." } };
  }

  const full = await authorizeActor("broadcast.manage");
  if (full.authorized) return checkWebpageEmbeddable(input);

  const scoped = await authorizeActor("broadcast.playlists.manage");
  if (scoped.authorized) return checkWebpageEmbeddable(input);

  return { success: false, error: scoped.error };
}
