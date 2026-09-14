import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastScheduledAlerts } from "../../../database/schema";
import type { BroadcastScheduledAlertRecord } from "../../../contracts/types";

export async function applyScheduledAlertEnabled(id: string, enabled: boolean): Promise<BroadcastScheduledAlertRecord | null> {
  const [row] = await db
    .update(broadcastScheduledAlerts)
    .set({ enabled, updatedAt: sql`now()` })
    .where(eq(broadcastScheduledAlerts.id, id))
    .returning();
  return (row as BroadcastScheduledAlertRecord) ?? null;
}
