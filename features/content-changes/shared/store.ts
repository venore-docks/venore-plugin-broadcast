import { and, desc, eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastContentChanges } from "../../../database/schema";
import type { BroadcastContentChangeRecord, BroadcastContentChangeStatus } from "../../../contracts/types";

export async function insertContentChange(input: {
  useCase: string;
  entityType: BroadcastContentChangeRecord["entityType"];
  targetId: string | null;
  playlistId: string | null;
  payload: unknown;
  previousSnapshot: unknown;
  resultSnapshot: unknown;
  status: BroadcastContentChangeStatus;
  requestedBy: string;
  decidedBy: string | null;
  decidedAt: Date | null;
}): Promise<BroadcastContentChangeRecord> {
  const [row] = await db
    .insert(broadcastContentChanges)
    .values({
      useCase: input.useCase,
      entityType: input.entityType,
      targetId: input.targetId,
      playlistId: input.playlistId,
      payload: input.payload,
      previousSnapshot: input.previousSnapshot,
      resultSnapshot: input.resultSnapshot,
      status: input.status,
      requestedBy: input.requestedBy,
      decidedBy: input.decidedBy,
      decidedAt: input.decidedAt,
    })
    .returning();
  return row as BroadcastContentChangeRecord;
}

export async function findContentChangeById(id: string): Promise<BroadcastContentChangeRecord | null> {
  const [row] = await db.select().from(broadcastContentChanges).where(eq(broadcastContentChanges.id, id)).limit(1);
  return (row as BroadcastContentChangeRecord) ?? null;
}

// Bloqueia uma 2ª pendência no MESMO alvo (mesmo useCase) enquanto a 1ª ainda não foi decidida —
// decisão de design (ver memória do usuário): evita duas propostas concorrentes pro mesmo item
// brigarem por qual "previousSnapshot" vale na hora de aprovar.
export async function findPendingContentChangeForTarget(
  targetId: string,
  useCase: string,
): Promise<BroadcastContentChangeRecord | null> {
  const [row] = await db
    .select()
    .from(broadcastContentChanges)
    .where(
      and(
        eq(broadcastContentChanges.targetId, targetId),
        eq(broadcastContentChanges.useCase, useCase),
        eq(broadcastContentChanges.status, "pending"),
      ),
    )
    .limit(1);
  return (row as BroadcastContentChangeRecord) ?? null;
}

export async function markContentChangeApproved(
  id: string,
  input: { decidedBy: string; resultSnapshot: unknown; targetId: string | null },
): Promise<void> {
  await db
    .update(broadcastContentChanges)
    .set({ status: "approved", decidedBy: input.decidedBy, decidedAt: new Date(), resultSnapshot: input.resultSnapshot, targetId: input.targetId })
    .where(eq(broadcastContentChanges.id, id));
}

export async function markContentChangeRejected(id: string, input: { decidedBy: string; reason: string }): Promise<void> {
  await db
    .update(broadcastContentChanges)
    .set({ status: "rejected", decidedBy: input.decidedBy, decidedAt: new Date(), rejectionReason: input.reason })
    .where(eq(broadcastContentChanges.id, id));
}

export async function markContentChangeFailed(id: string, reason: string): Promise<void> {
  await db.update(broadcastContentChanges).set({ status: "failed", failureReason: reason }).where(eq(broadcastContentChanges.id, id));
}

// Só o próprio solicitante desiste da própria pendência (checado no service, não aqui) — cancelar
// não é uma decisão de aprovação, não seta decidedBy/decidedAt.
export async function markContentChangeCancelled(id: string): Promise<void> {
  await db.update(broadcastContentChanges).set({ status: "cancelled" }).where(eq(broadcastContentChanges.id, id));
}

export async function listPendingContentChanges(): Promise<BroadcastContentChangeRecord[]> {
  const rows = await db
    .select()
    .from(broadcastContentChanges)
    .where(eq(broadcastContentChanges.status, "pending"))
    .orderBy(broadcastContentChanges.requestedAt);
  return rows as BroadcastContentChangeRecord[];
}

// Log de auditoria completo — todo status, mais recente primeiro. limit é um teto de segurança
// (200), não paginação de verdade — suficiente pro volume esperado de mudanças de conteúdo; se
// crescer demais, paginação de verdade é trabalho pra depois.
export async function listContentChangeLog(): Promise<BroadcastContentChangeRecord[]> {
  const rows = await db.select().from(broadcastContentChanges).orderBy(desc(broadcastContentChanges.requestedAt)).limit(200);
  return rows as BroadcastContentChangeRecord[];
}

export async function listMyContentChanges(requestedBy: string): Promise<BroadcastContentChangeRecord[]> {
  const rows = await db
    .select()
    .from(broadcastContentChanges)
    .where(eq(broadcastContentChanges.requestedBy, requestedBy))
    .orderBy(desc(broadcastContentChanges.requestedAt))
    .limit(200);
  return rows as BroadcastContentChangeRecord[];
}
