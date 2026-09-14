import { eq } from "drizzle-orm";
import { db } from "@venore/plugin-sdk";
import { broadcastOutputDiagnostics, broadcastOutputs } from "../../../database/schema";

export type OutputLastSeenRow = { outputId: string; outputName: string; browserReportedAt: Date | null };

// LEFT JOIN — toda saída aparece, mesmo sem nenhuma linha de diagnóstico ainda (browserReportedAt
// null quando a TV nunca abriu a URL) — mesmo padrão de get-output-diagnostics/store.ts (query
// própria, não reaproveitada de lá, pra manter os dois lados independentes: aquele alimenta a
// página de diagnóstico, este alimenta a notificação de tela offline).
export async function findOutputLastSeenRows(): Promise<OutputLastSeenRow[]> {
  const rows = await db
    .select({
      outputId: broadcastOutputs.id,
      outputName: broadcastOutputs.name,
      browserReportedAt: broadcastOutputDiagnostics.browserReportedAt,
    })
    .from(broadcastOutputs)
    .leftJoin(broadcastOutputDiagnostics, eq(broadcastOutputDiagnostics.outputId, broadcastOutputs.id));
  return rows as OutputLastSeenRow[];
}
