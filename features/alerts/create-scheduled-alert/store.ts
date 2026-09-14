import { db } from "@venore/plugin-sdk";
import { broadcastScheduledAlerts } from "../../../database/schema";
import type { BroadcastScheduledAlertRecord } from "../../../contracts/types";

export async function insertScheduledAlert(input: {
  message: string;
  target: string | null;
  activeDays: number;
  activeStartMinute: number;
  activeEndMinute: number;
}): Promise<BroadcastScheduledAlertRecord> {
  const [row] = await db.insert(broadcastScheduledAlerts).values(input).returning();
  return row as BroadcastScheduledAlertRecord;
}
