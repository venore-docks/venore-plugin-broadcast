"use client";

import { useActionState, useRef, useState, type ReactNode, type RefObject } from "react";
import { CalendarClock, CalendarDays, ExternalLink, ListVideo, Radio, Siren, Tv, X } from "lucide-react";
import { Button } from "@venore/plugin-sdk/ui";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@venore/plugin-sdk/ui";
import { Input } from "@venore/plugin-sdk/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@venore/plugin-sdk/ui";
import { Switch } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
import { PlaybackReportPanel } from "./playlists-section";
import { DAY_LABELS, minutesToTimeLabel } from "../../shared/playlist-schedule";
import type { BroadcastLiveStreamSummary, BroadcastScheduledAlertRecord } from "../../index";
import { youTubeThumbnailUrl, youTubeWatchUrl } from "../../shared/youtube";
import {
  clearAlertAction,
  clearTakeoverAction,
  createScheduledAlertAction,
  deleteScheduledAlertAction,
  publishAlertAction,
  publishTakeoverAction,
  startLiveStreamAction,
  stopLiveStreamAction,
  toggleScheduledAlertAction,
  type BroadcastActionState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };

export type AlertTargets = { groups: string[]; outputs: { id: string; name: string }[] };

// Seletor de alvo compartilhado pelo aviso rápido e pelo comunicado de urgência: "" = todas as
// telas; "group:<nome>" = um grupo; "output:<id>" = uma tela. Escreve num <input hidden name="target">.
function AlertTargetField({ targets }: { targets: AlertTargets }) {
  const [value, setValue] = useState("");
  return (
    <div className="min-w-52 space-y-1">
      <label className="text-xs text-muted-foreground">Onde aparece</label>
      <input type="hidden" name="target" value={value} />
      <Select value={value || "__all__"} onValueChange={(next) => setValue(next === "__all__" ? "" : next)}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">Todas as telas</SelectItem>
          {targets.groups.map((group) => (
            <SelectItem key={`group:${group}`} value={`group:${group}`}>
              Grupo: {group}
            </SelectItem>
          ))}
          {targets.outputs.map((output) => (
            <SelectItem key={`output:${output.id}`} value={`output:${output.id}`}>
              Tela: {output.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

// Mini-réplica do AlertBanner de verdade (components/output/layer-renderer.tsx) — mesmo gradiente,
// mesmo ⚠️, pra "o que eu vou publicar" não ser uma suposição. Só o suficiente pra pegar erro de
// digitação/formatação antes de ir pra TV ao vivo, não uma simulação pixel-perfect.
function AlertPreviewMockup({ message }: { message: string }) {
  return (
    <div
      className="flex w-full items-center gap-3 rounded-md px-5 py-4"
      style={{ background: "linear-gradient(90deg, #B3261E, #E8482C)", color: "#FFFFFF" }}
    >
      <span className="text-xl">⚠️</span>
      <span className="text-base font-semibold">{message}</span>
    </div>
  );
}

// Botão que só publica depois de uma confirmação com preview — pedido do backlog: "preview de
// alerta/takeover antes de publicar... evita erro indo direto pra TV ao vivo". reportValidity()
// aciona a validação nativa do form (ex: mensagem vazia) antes mesmo de abrir o diálogo — o botão
// não é mais type="submit" de propósito, senão o form submeteria direto no clique.
function PublishWithPreviewButton({
  formRef,
  pending,
  label,
  variant,
  renderPreview,
}: {
  formRef: RefObject<HTMLFormElement | null>;
  pending: boolean;
  label: string;
  variant?: "default" | "destructive";
  renderPreview: (message: string) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");

  function handlePreviewClick() {
    const form = formRef.current;
    if (!form || !form.reportValidity()) return;
    setMessage(new FormData(form).get("message")?.toString() ?? "");
    setOpen(true);
  }

  return (
    <>
      <Button type="button" variant={variant} disabled={pending} onClick={handlePreviewClick}>
        {label}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar antes de publicar</DialogTitle>
            <DialogDescription>É isto que vai aparecer na TV — confira o texto antes de ir ao vivo.</DialogDescription>
          </DialogHeader>
          {renderPreview(message)}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant={variant}
              disabled={pending}
              onClick={() => {
                setOpen(false);
                formRef.current?.requestSubmit();
              }}
            >
              Confirmar e publicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// Movido de components/admin/outputs-section.tsx (era QuickAlertPanel lá) — pedido explícito:
// "o card Aviso rápido vamos separar ele em outro lugar [...] o aviso rápido pode estar lá" (no
// novo dashboard). Sem mudança de comportamento — mesmo formulário, mesmas actions. Global (não
// por saída) — aparece em toda saída, e some sozinho quando a duração passa; "Remover agora" força
// isso antes do tempo, se precisar.
function QuickAlertPanel({ targets }: { targets: AlertTargets }) {
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
        Aparece em cima do conteúdo (empurrando, sem cobrir nada), e some sozinho depois do tempo.
      </p>
      <form ref={publishFormRef} action={publishFormAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="alert-message">Mensagem</label>
          <Input id="alert-message" name="message" placeholder="Reunião às 15h no auditório" required />
        </div>
        <AlertTargetField targets={targets} />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="alert-duration">Segundos na tela</label>
          <Input id="alert-duration" name="durationSeconds" type="number" defaultValue={30} className="w-24" />
        </div>
        <PublishWithPreviewButton
          formRef={publishFormRef}
          pending={publishPending}
          label="Publicar aviso"
          renderPreview={(message) => <AlertPreviewMockup message={message} />}
        />
      </form>
      <form action={clearFormAction}>
        <Button type="submit" variant="outline" size="sm" disabled={clearPending}>Remover agora</Button>
      </form>
    </div>
  );
}

// Mini-réplica do TakeoverScreen de verdade (components/output/output-canvas.tsx) — fundo preto,
// texto grande centralizado com sombra. Sem a mídia (a UI pra escolhê-la ainda não existe, mesmo
// racional do comentário abaixo) — só o texto, que é o que dá pra errar digitando.
function TakeoverPreviewMockup({ message }: { message: string }) {
  return (
    <div className="flex aspect-video w-full items-center justify-center overflow-hidden rounded-md" style={{ background: "#0a0a0a" }}>
      <p
        className="max-w-[85%] px-4 text-center text-lg font-bold leading-tight"
        style={{ color: "#FFFFFF", textShadow: "0 4px 24px rgba(0,0,0,0.8)" }}
      >
        {message}
      </p>
    </div>
  );
}

// Takeover de urgência — movido de outputs-section.tsx (v1.7): cobre a tela em tela cheia
// (evacuação, recado crítico), inclusive as em modo espera. Pode ir pra todas, pra um grupo ou
// pra uma tela (v1.8). Só mensagem por ora; a imagem existe no schema/state, a UI pra escolhê-la
// fica pra depois.
function TakeoverPanel({ targets }: { targets: AlertTargets }) {
  const publishFormRef = useRef<HTMLFormElement>(null);
  const [publishState, publishFormAction, publishPending] = useActionState(publishTakeoverAction, initialState);
  useActionToast({
    pending: publishPending,
    error: publishState.error,
    successMessage: "Comunicado publicado.",
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
        Cobre a tela em tela cheia — inclusive as em modo espera. Some sozinho depois do tempo.
      </p>
      <form ref={publishFormRef} action={publishFormAction} className="flex flex-wrap items-end gap-2">
        <div className="min-w-64 flex-1 space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="takeover-message">Mensagem</label>
          <Input id="takeover-message" name="message" placeholder="EVACUAÇÃO — sigam para a saída mais próxima" required />
        </div>
        <AlertTargetField targets={targets} />
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="takeover-duration">Segundos na tela</label>
          <Input id="takeover-duration" name="durationSeconds" type="number" defaultValue={120} className="w-24" />
        </div>
        <PublishWithPreviewButton
          formRef={publishFormRef}
          pending={publishPending}
          label="Publicar comunicado"
          variant="destructive"
          renderPreview={(message) => <TakeoverPreviewMockup message={message} />}
        />
      </form>
      <form action={clearFormAction}>
        <Button type="submit" variant="outline" size="sm" disabled={clearPending}>Remover agora</Button>
      </form>
    </div>
  );
}

export type LiveStreamOutputOption = { id: string; name: string; groupName: string | null; liveStreamId: string | null };

// Transmissão ao vivo do YouTube (v1.9.11) — escolha livre de telas (não o alvo único "todas/grupo/
// tela" do aviso): pedido explícito "transmitir para as telas que eu selecionar". Os atalhos de
// grupo só marcam as telas do grupo nos checkboxes, nada além disso.
function LiveStreamPanel({
  outputs,
  liveStreams,
}: {
  outputs: LiveStreamOutputOption[];
  liveStreams: BroadcastLiveStreamSummary[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [state, formAction, pending] = useActionState(startLiveStreamAction, initialState);
  useActionToast({
    pending,
    error: state.error,
    successMessage: "Transmissão no ar.",
    onSuccess: () => {
      formRef.current?.reset();
      setSelected(new Set());
    },
  });

  const groups = [...new Set(outputs.map((output) => output.groupName).filter((g): g is string => Boolean(g)))].sort();

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectMany(ids: string[]) {
    setSelected((current) => new Set([...current, ...ids]));
  }

  const quickSelectClassName = "rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground ui-motion-base hover:bg-muted";

  return (
    <div className="space-y-3 rounded-panel border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <Radio className="size-4 text-destructive" aria-hidden="true" /> Transmissão ao vivo (YouTube)
      </p>
      <p className="text-xs text-muted-foreground">
        Entra no lugar da playlist, em tela cheia e com som, nas telas que você escolher — até você tirar. Cada tela assiste
        direto do YouTube. O som só toca se o navegador da TV estiver configurado para permitir áudio automático.
      </p>

      {outputs.length === 0 ? (
        <p className="text-xs text-muted-foreground">Cadastre uma tela primeiro.</p>
      ) : (
        <form ref={formRef} action={formAction} className="space-y-2">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground" htmlFor="live-stream-url">Link da transmissão</label>
            <Input id="live-stream-url" name="url" placeholder="https://www.youtube.com/watch?v=…" required />
          </div>
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs text-muted-foreground">Telas:</span>
              <button type="button" className={quickSelectClassName} onClick={() => selectMany(outputs.map((output) => output.id))}>
                Todas
              </button>
              {groups.map((group) => (
                <button
                  key={group}
                  type="button"
                  className={quickSelectClassName}
                  onClick={() => selectMany(outputs.filter((output) => output.groupName === group).map((output) => output.id))}
                >
                  Grupo: {group}
                </button>
              ))}
              {selected.size > 0 && (
                <button type="button" className={quickSelectClassName} onClick={() => setSelected(new Set())}>
                  Limpar
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2 lg:grid-cols-3">
              {outputs.map((output) => (
                <label key={output.id} className="flex items-center gap-2 rounded-md px-1 py-0.5 text-sm text-foreground">
                  <input
                    type="checkbox"
                    name="outputIds"
                    value={output.id}
                    checked={selected.has(output.id)}
                    onChange={() => toggle(output.id)}
                    className="size-4 shrink-0 rounded border-border"
                  />
                  <span className="min-w-0 truncate">{output.name}</span>
                  {output.liveStreamId && (
                    <span className="shrink-0 rounded-full bg-destructive/10 px-1.5 text-xs font-semibold uppercase text-destructive">
                      Ao vivo
                    </span>
                  )}
                </label>
              ))}
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending || selected.size === 0}>
            {selected.size === 0
              ? "Escolha as telas"
              : `Transmitir em ${selected.size} ${selected.size === 1 ? "tela" : "telas"}`}
          </Button>
        </form>
      )}

      {liveStreams.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          <p className="text-xs font-medium text-muted-foreground">No ar agora</p>
          {liveStreams.map((stream) => (
            <LiveStreamRow key={stream.id} stream={stream} />
          ))}
        </div>
      )}
    </div>
  );
}

function LiveStreamRow({ stream }: { stream: BroadcastLiveStreamSummary }) {
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-md border border-border p-2">
      {/* eslint-disable-next-line @next/next/no-img-element -- miniatura servida direto pelo YouTube, sem next/image */}
      <img src={youTubeThumbnailUrl(stream.videoId)} alt="" className="aspect-video w-28 shrink-0 rounded-sm object-cover" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <a
          href={youTubeWatchUrl(stream.videoId)}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm font-medium text-foreground hover:underline"
        >
          <span className="truncate">{stream.title ?? stream.sourceUrl}</span>
          <ExternalLink className="size-3 shrink-0 text-muted-foreground" aria-hidden="true" />
        </a>
        <div className="flex flex-wrap gap-1">
          {stream.outputs.map((output) => (
            <span key={output.id} className="flex items-center gap-1 rounded-full bg-muted py-0.5 pl-2 pr-0.5 text-xs text-foreground">
              {output.name}
              <StopLiveStreamButton liveStreamId={stream.id} outputId={output.id} label={`Tirar ${output.name} da transmissão`} />
            </span>
          ))}
        </div>
      </div>
      <StopLiveStreamButton liveStreamId={stream.id} outputId={null} label="Encerrar em todas" />
    </div>
  );
}

// outputId null = encerra a transmissão inteira; preenchido = vira o "×" de um chip de tela.
function StopLiveStreamButton({ liveStreamId, outputId, label }: { liveStreamId: string; outputId: string | null; label: string }) {
  const [state, formAction, pending] = useActionState(stopLiveStreamAction, initialState);
  useActionToast({
    pending,
    error: state.error,
    successMessage: outputId ? "Tela voltou para a playlist." : "Transmissão encerrada.",
  });

  return (
    <form action={formAction}>
      <input type="hidden" name="liveStreamId" value={liveStreamId} />
      <input type="hidden" name="outputId" value={outputId ?? ""} />
      {outputId ? (
        <button
          type="submit"
          disabled={pending}
          aria-label={label}
          title={label}
          className="flex size-5 items-center justify-center rounded-full text-muted-foreground ui-motion-base hover:bg-background hover:text-foreground"
        >
          <X className="size-3" aria-hidden="true" />
        </button>
      ) : (
        <Button type="submit" variant="outline" size="sm" disabled={pending}>
          {label}
        </Button>
      )}
    </form>
  );
}

// Avisos AGENDADOS/RECORRENTES (backlog item 6) — mesma mensagem/alvo do aviso rápido, mas dentro
// de uma janela dia-da-semana+horário que se repete sozinha (reaproveita o horário de
// funcionamento já usado em telas — DAY_LABELS/minutesToTimeLabel, shared/playlist-schedule.ts).
// Sem contador regressivo aqui: o servidor decide sozinho quando está "dentro da janela" a cada
// vez que uma TV pede o estado (get-output-state/service.ts).
function CreateScheduledAlertForm({ targets, onCreated }: { targets: AlertTargets; onCreated?: () => void }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [days, setDays] = useState(0);
  const [state, formAction, pending] = useActionState(createScheduledAlertAction, initialState);
  useActionToast({
    pending,
    error: state.error,
    successMessage: "Aviso agendado criado.",
    onSuccess: () => {
      formRef.current?.reset();
      setDays(0);
      onCreated?.();
    },
  });

  return (
    <form ref={formRef} action={formAction} className="space-y-2">
      <input type="hidden" name="days" value={days} />
      <Input name="message" placeholder="Reunião toda segunda às 8h" required />
      <div className="flex flex-wrap gap-1">
        {DAY_LABELS.map((label, dayIndex) => {
          const bit = 1 << dayIndex;
          const on = (days & bit) !== 0;
          return (
            <button
              key={label}
              type="button"
              onClick={() => setDays((current) => current ^ bit)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="scheduled-alert-start">Das</label>
          <input
            id="scheduled-alert-start"
            type="time"
            name="startTime"
            required
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground" htmlFor="scheduled-alert-end">Às</label>
          <input
            id="scheduled-alert-end"
            type="time"
            name="endTime"
            required
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          />
        </div>
        <AlertTargetField targets={targets} />
        <Button type="submit" size="sm" disabled={pending}>Agendar aviso</Button>
      </div>
    </form>
  );
}

function ScheduledAlertToggle({ id, enabled }: { id: string; enabled: boolean }) {
  const [state, formAction, pending] = useActionState(toggleScheduledAlertAction, initialState);
  useActionToast({ pending, error: state.error });
  const formRef = useRef<HTMLFormElement>(null);
  const enabledInputRef = useRef<HTMLInputElement>(null);

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="enabled" ref={enabledInputRef} defaultValue={enabled ? "false" : "true"} />
      <Switch
        checked={enabled}
        disabled={pending}
        onCheckedChange={(next) => {
          if (enabledInputRef.current) enabledInputRef.current.value = next ? "true" : "false";
          formRef.current?.requestSubmit();
        }}
      />
    </form>
  );
}

function DeleteScheduledAlertButton({ id }: { id: string }) {
  const [state, formAction, pending] = useActionState(deleteScheduledAlertAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Aviso agendado removido." });

  return (
    <form action={formAction}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="ghost" size="sm" disabled={pending}>Remover</Button>
    </form>
  );
}

function scheduledAlertWindowLabel(alert: BroadcastScheduledAlertRecord): string {
  const days = DAY_LABELS.filter((_, dayIndex) => (alert.activeDays & (1 << dayIndex)) !== 0).join(", ");
  return `${days} · ${minutesToTimeLabel(alert.activeStartMinute)}–${minutesToTimeLabel(alert.activeEndMinute)}`;
}

function ScheduledAlertsPanel({ targets, scheduledAlerts }: { targets: AlertTargets; scheduledAlerts: BroadcastScheduledAlertRecord[] }) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="space-y-2 rounded-panel border border-border bg-card p-3">
      <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        <CalendarClock className="size-4" aria-hidden="true" /> Avisos agendados
      </p>
      <p className="text-xs text-muted-foreground">
        Repete sozinho toda semana, dentro da janela escolhida — sem precisar disparar na mão toda vez.
      </p>
      {scheduledAlerts.length > 0 && (
        <div className="space-y-1.5">
          {scheduledAlerts.map((alert) => (
            <div key={alert.id} className="flex flex-wrap items-center gap-2 rounded-panel border border-border/60 p-2 text-xs">
              <ScheduledAlertToggle id={alert.id} enabled={alert.enabled} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-foreground">{alert.message}</p>
                <p className="text-muted-foreground">{scheduledAlertWindowLabel(alert)}</p>
              </div>
              <DeleteScheduledAlertButton id={alert.id} />
            </div>
          ))}
        </div>
      )}
      {showForm ? (
        <CreateScheduledAlertForm targets={targets} onCreated={() => setShowForm(false)} />
      ) : (
        <Button type="button" variant="outline" size="sm" onClick={() => setShowForm(true)}>
          + Agendar aviso
        </Button>
      )}
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
  alertTargets,
  scheduledAlerts,
  liveStreamOutputs,
  liveStreams,
}: {
  outputsCount: number;
  playlistsCount: number;
  agendasCount: number;
  playlistsInUse: PlaylistInUse[];
  alertTargets: AlertTargets;
  scheduledAlerts: BroadcastScheduledAlertRecord[];
  liveStreamOutputs: LiveStreamOutputOption[];
  liveStreams: BroadcastLiveStreamSummary[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryStat icon={<Tv className="size-5" aria-hidden="true" />} label="Telas cadastradas" count={outputsCount} />
        <SummaryStat icon={<ListVideo className="size-5" aria-hidden="true" />} label="Playlists" count={playlistsCount} />
        <SummaryStat icon={<CalendarDays className="size-5" aria-hidden="true" />} label="Agendas" count={agendasCount} />
      </div>
      <QuickAlertPanel targets={alertTargets} />
      <ScheduledAlertsPanel targets={alertTargets} scheduledAlerts={scheduledAlerts} />
      <TakeoverPanel targets={alertTargets} />
      <LiveStreamPanel outputs={liveStreamOutputs} liveStreams={liveStreams} />
      <PlaylistsInUsePanel playlists={playlistsInUse} />
      <PlaybackReportPanel />
    </div>
  );
}
