import type { UpdatePlaylistItemInput } from "./types";

// Mesma regra de add-webpage-playlist-item: rota interna ("/cursos") ou URL http(s) completa.
function isValidWebpageUrl(url: string): boolean {
  if (url.startsWith("/")) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function validateUpdatePlaylistItemInput(input: UpdatePlaylistItemInput): { code: string; message: string } | null {
  if (!input.itemId) {
    return { code: "broadcast.update-playlist-item.invalid_item", message: "Item inválido." };
  }
  if (input.durationSeconds !== undefined && input.durationSeconds !== null && !(input.durationSeconds > 0)) {
    return { code: "broadcast.update-playlist-item.invalid_duration", message: "A duração precisa ser um número maior que zero." };
  }
  if (input.url !== undefined && input.url !== null && input.url !== "" && !isValidWebpageUrl(input.url)) {
    return {
      code: "broadcast.update-playlist-item.invalid_url",
      message: 'Informe uma URL completa (https://...) ou uma rota interna começando com "/".',
    };
  }
  if (
    input.visibleFrom != null &&
    input.visibleUntil != null &&
    input.visibleUntil.getTime() <= input.visibleFrom.getTime()
  ) {
    return {
      code: "broadcast.update-playlist-item.invalid_validity_window",
      message: "O fim da validade precisa ser depois do início.",
    };
  }
  return null;
}
