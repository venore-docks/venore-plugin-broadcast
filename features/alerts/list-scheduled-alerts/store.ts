import { desc } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastScheduledAlerts } from "../../../database/schema";
import type { BroadcastScheduledAlertRecord } from "../../../contracts/types";

export async function findAllScheduledAlerts(): Promise<BroadcastScheduledAlertRecord[]> {
  const rows = await db.select().from(broadcastScheduledAlerts).orderBy(desc(broadcastScheduledAlerts.createdAt));
  return rows as BroadcastScheduledAlertRecord[];
}
