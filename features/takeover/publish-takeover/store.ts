import { db } from "@venore/plugin-sdk";
import { broadcastTakeover } from "../../../database/schema";
import type { BroadcastTakeoverRecord } from "../../../contracts/types";

export async function insertTakeover(input: {
  message: string;
  mediaAssetId: string | null;
  target: string | null;
  expiresAt: Date;
}): Promise<BroadcastTakeoverRecord> {
  const [row] = await db.insert(broadcastTakeover).values(input).returning();
  return row as BroadcastTakeoverRecord;
}
