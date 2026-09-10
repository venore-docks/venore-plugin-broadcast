import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";

export async function findOutputTokenById(id: string): Promise<string | null> {
  const [row] = await db.select({ token: broadcastOutputs.token }).from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return row?.token ?? null;
}
