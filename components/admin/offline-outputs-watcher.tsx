"use client";

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { WifiOff } from "lucide-react";
import { getOfflineOutputsAction } from "./actions";
import type { OfflineOutputInfo } from "../../index";

// Notificação in-app de tela offline (roadmap item 4) — pedido explícito do usuário: "não vamos
// configurar e-mail. A notificação pode acontecer por meio de um roaster/tooltip na plataforma."
// Dois pedaços: um toast na primeira vez que uma tela cruza o limiar (OFFLINE_AFTER_MS, ver
// service.ts) e uma faixa persistente ("roster") enquanto ela continuar offline — cobre tanto
// quem está olhando na hora quanto quem só passa o olho na página depois.
//
// Montado uma vez, no topo de BroadcastAdminPage (não dentro da aba Telas) — pra notificar
// independente de qual aba está aberta.
const POLL_MS = 60_000;

function formatOfflineDuration(ms: number): string {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes === 0 ? `${hours}h` : `${hours}h${remainingMinutes}min`;
}

export function OfflineOutputsWatcher() {
  const [offline, setOffline] = useState<OfflineOutputInfo[]>([]);
  // Ids já notificados (toast já mostrado) NESTA sessão do navegador — evita repetir o toast a
  // cada poll enquanto a tela continua offline. Removido do Set quando a tela volta, pra poder
  // notificar de novo se cair outra vez depois.
  const notifiedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      const data = await getOfflineOutputsAction();
      if (cancelled) return;

      for (const entry of data) {
        if (notifiedRef.current.has(entry.outputId)) continue;
        notifiedRef.current.add(entry.outputId);
        toast.warning(`Tela "${entry.outputName}" está desconectada há ${formatOfflineDuration(entry.offlineForMs)}.`);
      }
      const currentIds = new Set(data.map((entry) => entry.outputId));
      for (const id of notifiedRef.current) {
        if (!currentIds.has(id)) notifiedRef.current.delete(id);
      }

      setOffline(data);
    }

    poll();
    const interval = setInterval(poll, POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  // Sem faixa quando não há nada offline — é aviso, não um widget permanente.
  if (offline.length === 0) return null;

  return (
    <div className="flex items-start gap-2 rounded-panel border border-warning-border bg-warning-soft p-2.5 text-sm text-warning">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <p>
        {offline.length} {offline.length === 1 ? "tela desconectada" : "telas desconectadas"}:{" "}
        {offline.map((entry) => `${entry.outputName} (há ${formatOfflineDuration(entry.offlineForMs)})`).join(", ")}
      </p>
    </div>
  );
}
