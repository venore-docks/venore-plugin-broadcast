"use client";

import { useActionState, useRef } from "react";
import { CalendarDays, ExternalLink, ListVideo, Siren, Tv } from "lucide-react";
import { Button } from "@venore/plugin-sdk/ui";
import { Input } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
import { PlaybackReportPanel } from "./playlists-section";
import {
  clearAlertAction,
  clearTakeoverAction,
  publishAlertAction,
  publishTakeoverAction,
  type BroadcastActionState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };

// Movido de components/admin/outputs-section.tsx (era QuickAlertPanel lá) — pedido explícito:
// "o card Aviso rápido vamos separar ele em outro lugar [...] o aviso rápido pode estar lá" (no
// novo dashboard). Sem mudança de comportamento — mesmo formulário, mesmas actions. Global (não
// por saída) — aparece em toda saída, e some sozinho quando a duração passa; "Remover agora" força
// isso antes do tempo, se precisar.
function QuickAlertPanel() {
  const publishFormRef = useRef<HTMLFormElement>(null);
  const [publishState, publishFormAction, publishPending] = useActionState(publishAlertAction, initialState);
  // Sem revalidatePath (a TV reage via SSE) — limpa o campo no sucesso pra não parecer que a
  // mensagem já publicada continua na fila.
  useActionToast({
    pending: publishPending,
    error: publishState.error,
    successMessage: "Aviso publicado.",
    onSuccess: () => publishFormRef.current?.reset(),
  });

  const [clearState, clearFormAction, clearPending] = useActionState(clearAlertAction, initialState);
  useActionToast({ pending: clearPending, error: clearState.error, successMessage: "Aviso removido." });

  return (
    <div className="space-y-2 rounded-panel border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Aviso rápido</p>
      <p className="text-xs text-muted-foreground">
        Aparece em cima do conteúdo (empurrando, sem cobrir nada) em qualquer tela, e some sozinho depois do tempo.
      </p>
      <form ref={publishFormRef} action={publishFormAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="alert-message">Mensagem</label>
          <Input id="alert-message" name="message" placeholder="Reunião às 15h no auditório" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="alert-duration">Segundos na tela</label>
          <Input id="alert-duration" name="durationSeconds" type="number" defaultValue={30} className="w-24" />
        </div>
        <Button type="submit" disabled={publishPending}>Publicar aviso</Button>
      </form>
      <form action={clearFormAction}>
        <Button type="submit" variant="outline" size="sm" disabled={clearPending}>Remover agora</Button>
      </form>
    </div>
  );
}

// Takeover de urgência — movido de outputs-section.tsx (v1.7): cobre TODAS as telas em tela cheia
// (evacuação, recado crítico), inclusive as em modo espera. É da instalação inteira, não de uma
// tela — por isso mora no Dashboard, junto do aviso rápido. Só mensagem por ora; a imagem existe
// no schema/state, a UI pra escolhê-la fica pra depois.
function TakeoverPanel() {
  const publishFormRef = useRef<HTMLFormElement>(null);
  const [publishState, publishFormAction, publishPending] = useActionState(publishTakeoverAction, initialState);
  useActionToast({
    pending: publishPending,
    error: publishState.error,
    successMessage: "Comunicado publicado em todas as telas.",
    onSuccess: () => publishFormRef.current?.reset(),
  });
  const [clearState, clearFormAction, clearPending] = useActionState(clearTakeoverAction, initialState);
  useActionToast({ pending: clearPending, error: clearState.error, successMessage: "Comunicado removido." });

  return (
    <div className="space-y-2 rounded-panel border border-destructive/40 bg-destructive/5 p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-destructive">
        <Siren className="size-4" aria-hidden="true" /> Comunicado de urgência
      </p>
      <p className="text-xs text-muted-foreground">
        Cobre <strong>todas</strong> as telas em tela cheia — inclusive as em modo espera. Some sozinho depois do tempo.
      </p>
      <form ref={publishFormRef} action={publishFormAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="takeover-message">Mensagem</label>
          <Input id="takeover-message" name="message" placeholder="EVACUAÇÃO — sigam para a saída mais próxima" required />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="takeover-duration">Segundos na tela</label>
          <Input id="takeover-duration" name="durationSeconds" type="number" defaultValue={120} className="w-24" />
        </div>
        <Button type="submit" variant="destructive" disabled={publishPending}>Publicar comunicado</Button>
      </form>
      <form action={clearFormAction}>
        <Button type="submit" variant="outline" size="sm" disabled={clearPending}>Remover agora</Button>
      </form>
    </div>
  );
}

// Contagem simples (sem clique-pra-navegar, sem status colorido) — os cards grandes com status já
// existem acima da Tabs (AdminOverviewNav, sempre visíveis independente da aba ativa); repetir o
// mesmo cartão aqui dentro do Dashboard seria redundante. Isto é só um resumo textual rápido de
// "quanto tem de cada coisa" pra acompanhar o aviso rápido.
function SummaryStat({ icon, label, count }: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="flex items-center gap-3 rounded-panel border border-border bg-card p-3">
      <span className="text-muted-foreground">{icon}</span>
      <div>
        <p className="text-2xl font-semibold tabular-nums text-foreground">{count}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// v1.7: sem aba "Playlists", este é o único lugar que dá a visão "quais playlists existem e quem
// usa o quê". Cada linha pula pro detalhe da tela dona (Telas › X › aba Conteúdo). Só entra
// playlist que alguma tela toca — playlist órfã não interessa aqui.
export type PlaylistInUse = {
  id: string;
  name: string;
  itemCount: number;
  ownerOutputId: string | null;
  outputNames: string[];
};

function PlaylistsInUsePanel({ playlists }: { playlists: PlaylistInUse[] }) {
  return (
    <div className="space-y-2 rounded-panel border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Playlists em uso</p>
      <p className="text-xs text-muted-foreground">O conteúdo de cada tela. Clique para editar os itens na tela dona.</p>
      {playlists.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhuma tela está tocando uma playlist ainda.</p>
      ) : (
        <div className="divide-y divide-border/60">
          {playlists.map((playlist) => {
            const row = (
              <div className="flex flex-wrap items-center gap-2 py-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{playlist.name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {playlist.itemCount} {playlist.itemCount === 1 ? "item" : "itens"}
                </span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Tv className="size-3" aria-hidden="true" />
                  {playlist.outputNames.length === 1 ? playlist.outputNames[0] : `${playlist.outputNames.length} telas`}
                </span>
                {playlist.ownerOutputId && <ExternalLink className="size-3 text-muted-foreground" aria-hidden="true" />}
              </div>
            );
            return playlist.ownerOutputId ? (
              <a
                key={playlist.id}
                href={`?aba=outputs&tela=${playlist.ownerOutputId}&ver=conteudo`}
                className="block ui-motion-base hover:bg-accent/6"
              >
                {row}
              </a>
            ) : (
              <div key={playlist.id}>{row}</div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Nova aba "Dashboard" (pedido explícito: "vamos criar um dashboard do broadcast com resumo — hoje
// ele abre direto em Telas") — primeira entrada de tabs em routes/admin/page.tsx, então vira a aba
// padrão ao abrir /admin/broadcast, no lugar de "Telas". Só pra hasFullAccess (mesmo gate de
// Configurações/Administradores) — o aviso rápido que morava aqui já era exclusivo desse nível de
// acesso dentro de OutputsSection.
export function DashboardSection({
  outputsCount,
  playlistsCount,
  agendasCount,
  playlistsInUse,
}: {
  outputsCount: number;
  playlistsCount: number;
  agendasCount: number;
  playlistsInUse: PlaylistInUse[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat icon={<Tv className="size-5" aria-hidden="true" />} label="Telas cadastradas" count={outputsCount} />
        <SummaryStat icon={<ListVideo className="size-5" aria-hidden="true" />} label="Playlists" count={playlistsCount} />
        <SummaryStat icon={<CalendarDays className="size-5" aria-hidden="true" />} label="Agendas" count={agendasCount} />
      </div>
      <QuickAlertPanel />
      <TakeoverPanel />
      <PlaylistsInUsePanel playlists={playlistsInUse} />
      <PlaybackReportPanel />
    </div>
  );
}
