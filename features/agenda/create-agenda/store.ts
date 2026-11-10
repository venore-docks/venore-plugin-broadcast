import { desc } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastAgendas } from "../../../database/schema";
import type { BroadcastAgendaRecord } from "../../../contracts/types";

export async function findMaxAgendaOrder(): Promise<number> {
  const [row] = await db.select({ order: broadcastAgendas.order }).from(broadcastAgendas).orderBy(desc(broadcastAgendas.order)).limit(1);
  return row?.order ?? -1;
}

export async function insertAgenda(input: {
  name: string;
  displaySeconds: number;
  order: number;
  backgroundColor: string | null;
  logoMediaAssetId: string | null;
  calendariosSectorSlug: string | null;
}): Promise<BroadcastAgendaRecord> {
  const [row] = await db.insert(broadcastAgendas).values(input).returning();
  return row as BroadcastAgendaRecord;
}
