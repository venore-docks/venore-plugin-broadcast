import { INVALID_WEBPAGE_ROUTE_MESSAGE, isValidInternalWebpageRoute } from "../../../shared/webpage-url";
import type { UpdatePlaylistItemInput } from "./types";

export function validateUpdatePlaylistItemInput(input: UpdatePlaylistItemInput): { code: string; message: string } | null {
  if (!input.itemId) {
    return { code: "broadcast.update-playlist-item.invalid_item", message: "Item inválido." };
  }
  if (input.durationSeconds !== undefined && input.durationSeconds !== null && !(input.durationSeconds > 0)) {
    return { code: "broadcast.update-playlist-item.invalid_duration", message: "A duração precisa ser um número maior que zero." };
  }
  if (input.url !== undefined && input.url !== null && input.url !== "" && !isValidInternalWebpageRoute(input.url)) {
    return { code: "broadcast.update-playlist-item.invalid_url", message: INVALID_WEBPAGE_ROUTE_MESSAGE };
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
