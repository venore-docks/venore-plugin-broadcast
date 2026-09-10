import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";

export async function findOutputsInGroup(groupName: string): Promise<{ id: string; token: string }[]> {
  return db
    .select({ id: broadcastOutputs.id, token: broadcastOutputs.token })
    .from(broadcastOutputs)
    .where(eq(broadcastOutputs.groupName, groupName));
}

export async function setOfflineForOutputs(ids: string[], offline: boolean): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(broadcastOutputs)
    .set({ offline, updatedAt: sql`now()` })
    .where(inArray(broadcastOutputs.id, ids));
}

export async function clearGroupForOutputs(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await db
    .update(broadcastOutputs)
    .set({ groupName: null, updatedAt: sql`now()` })
    .where(inArray(broadcastOutputs.id, ids));
}
