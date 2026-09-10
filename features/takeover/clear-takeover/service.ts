import { publishOutputEvent } from "../../../runtime/output-bus";
import { findAllOutputTokens } from "../../../shared/output-tokens";
import { expireActiveTakeovers } from "./store";
import type { ClearTakeoverResult } from "./types";

export async function clearTakeover(): Promise<ClearTakeoverResult> {
  const cleared = await expireActiveTakeovers();

  const tokens = await findAllOutputTokens();
  for (const token of tokens) publishOutputEvent(token, { type: "takeover-changed" });

  return { success: true, data: { cleared } };
}
