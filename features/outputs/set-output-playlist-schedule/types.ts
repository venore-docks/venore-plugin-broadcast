import type { OperationResult } from "@venore/plugin-sdk";

// Um slot de dayparting como vem do formulário — sem id (o conjunto é substituído inteiro, mesmo
// padrão de set-agenda-outputs / set-*-editors).
export type OutputPlaylistScheduleSlotInput = {
  playlistId: string;
  days: number;
  startMinute: number;
  endMinute: number;
};

export type SetOutputPlaylistScheduleCommand = {
  outputId: string;
  slots: OutputPlaylistScheduleSlotInput[];
  actorId: string;
};
export type SetOutputPlaylistScheduleInput = Omit<SetOutputPlaylistScheduleCommand, "actorId">;
export type SetOutputPlaylistScheduleResult = OperationResult<{ outputId: string; slots: OutputPlaylistScheduleSlotInput[] }>;
