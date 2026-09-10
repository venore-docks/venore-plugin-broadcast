import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs, broadcastPlaybackLog } from "../../../database/schema";

export async function findOutputIdByToken(token: string): Promise<string | null> {
  const [row] = await db.select({ id: broadcastOutputs.id }).from(broadcastOutputs).where(eq(broadcastOutputs.token, token)).limit(1);
  return row?.id ?? null;
}

export async function insertPlaybackLog(input: {
  outputId: string;
  playlistItemId: string;
  itemLabel: string;
}): Promise<void> {
  await db.insert(broadcastPlaybackLog).values(input);
}
