import { db } from "@venore/plugin-sdk";
import { broadcastAlerts } from "../../../database/schema";
import type { BroadcastAlertRecord } from "../../../contracts/types";

export async function insertAlert(input: {
  message: string;
  target: string | null;
  expiresAt: Date;
}): Promise<BroadcastAlertRecord> {
  const [row] = await db.insert(broadcastAlerts).values(input).returning();
  return row as BroadcastAlertRecord;
}
