import { gt } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastTakeover } from "../../../database/schema";

// "Limpar" = expirar agora todo takeover ainda válido — não apaga a linha (histórico), só reduz
// expiresAt pro passado (mesmo padrão de clear-alert).
export async function expireActiveTakeovers(): Promise<number> {
  const rows = await db
    .update(broadcastTakeover)
    .set({ expiresAt: new Date() })
    .where(gt(broadcastTakeover.expiresAt, new Date()))
    .returning({ id: broadcastTakeover.id });
  return rows.length;
}
