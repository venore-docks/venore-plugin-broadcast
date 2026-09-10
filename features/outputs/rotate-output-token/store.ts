import { randomBytes } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputs } from "../../../database/schema";
import type { BroadcastOutputRecord } from "../../../contracts/types";

const MAX_ATTEMPTS = 50;

export async function findOutputById(id: string): Promise<BroadcastOutputRecord | null> {
  const [row] = await db.select().from(broadcastOutputs).where(eq(broadcastOutputs.id, id)).limit(1);
  return (row as BroadcastOutputRecord) ?? null;
}

// Token curto e ALEATÓRIO (o ponto de rotacionar é ser imprevisível — diferente do slug do nome
// usado na criação). ~8 caracteres base64url, ainda digitável num controle remoto se precisar.
async function resolveRandomToken(): Promise<string> {
  const existing = await db.select({ token: broadcastOutputs.token }).from(broadcastOutputs);
  const used = new Set(existing.map((row) => row.token));
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const candidate = randomBytes(6).toString("base64url");
    if (!used.has(candidate)) return candidate;
  }
  throw new Error("unreachable");
}

export async function rotateOutputToken(outputId: string): Promise<string> {
  const token = await resolveRandomToken();
  await db
    .update(broadcastOutputs)
    .set({ token, updatedAt: sql`now()` })
    .where(eq(broadcastOutputs.id, outputId));
  return token;
}
