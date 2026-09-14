import type { OperationResult } from "@venore/plugin-sdk";

export type OfflineOutputInfo = {
  outputId: string;
  outputName: string;
  lastSeenAt: Date;
  offlineForMs: number;
};

export type ListOfflineOutputsResult = OperationResult<OfflineOutputInfo[]>;
