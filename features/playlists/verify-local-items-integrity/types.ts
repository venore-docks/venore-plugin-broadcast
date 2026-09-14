import type { OperationResult } from "@venore/plugin-sdk";

export type LocalItemIntegrityIssue = {
  itemId: string;
  playlistId: string;
  playlistName: string;
  title: string | null;
  relativePath: string;
  // "mismatch" = arquivo existe mas tamanho e/ou hash mudaram (possível substituição). "missing" =
  // o arquivo sumiu do disco.
  status: "mismatch" | "missing";
  recordedSizeBytes: number;
  currentSizeBytes: number | null;
};

export type VerifyLocalItemsIntegrityResult = OperationResult<LocalItemIntegrityIssue[]>;
