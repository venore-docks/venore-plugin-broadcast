import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastScheduledAlerts } from "../../../database/schema";

export async function deleteScheduledAlertById(id: string): Promise<boolean> {
  const rows = await db.delete(broadcastScheduledAlerts).where(eq(broadcastScheduledAlerts.id, id)).returning({ id: broadcastScheduledAlerts.id });
  return rows.length > 0;
}
