import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastPlaylistScheduleSlot } from "../../../contracts/types";

// Mapa "id da tela" → seus slots de dayparting. Usado pelo loader do admin (page.tsx), mesmo
// padrão de list-agenda-outputs.
export type ListOutputPlaylistSchedulesResult = OperationResult<Record<string, BroadcastPlaylistScheduleSlot[]>>;
