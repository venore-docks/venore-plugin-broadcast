import type { OperationResult } from "@venore/plugin-sdk";
import type { BroadcastPlaylistRecord } from "../../../contracts/types";
import type { BroadcastPlaylistSlideshow } from "../../../shared/slideshow";

export type SetPlaylistSlideshowCommand = {
  playlistId: string;
  slideshow: BroadcastPlaylistSlideshow;
  actorId: string;
};

// O input chega cru do formulário (strings) — validado em handler.ts via parseSlideshowInput.
export type SetPlaylistSlideshowInput = {
  playlistId: string;
  motion: unknown;
  motionStrength: unknown;
  transition: unknown;
  transitionMs: unknown;
};

export type SetPlaylistSlideshowResult = OperationResult<BroadcastPlaylistRecord>;
