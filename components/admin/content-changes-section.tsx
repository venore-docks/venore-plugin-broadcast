"use client";

import { useActionState, useId, useState } from "react";
import { Button } from "@venore/plugin-sdk/ui";
import { Card, CardContent, CardHeader, CardTitle } from "@venore/plugin-sdk/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@venore/plugin-sdk/ui";
import { Textarea } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
import type { BroadcastContentChangeRecord, BroadcastContentChangeStatus } from "../../contracts/types";
import {
  approveContentChangeAction,
  cancelContentChangeAction,
  rejectContentChangeAction,
  type BroadcastActionState,
} from "./actions";
import { StatusBadge } from "./status-dot";
import type { StatusTone } from "./status";

const initialState: BroadcastActionState = { error: null };

// Rótulo humano por useCase — mesmos 12 slugs de features/content-changes/shared/use-cases.ts.
// Um mapa fixo em vez de derivar do slug: "broadcast.add-media-asset-playlist-item" vira
// "Adicionar mídia da biblioteca", não um replace/capitalize genérico.
const USE_CASE_LABELS: Record<string, string> = {
  "broadcast.update-playlist-item": "Editar item de playlist",
  "broadcast.delete-playlist-item": "Remover item de playlist",
  "broadcast.reorder-playlist-items": "Reordenar playlist",
  "broadcast.toggle-playlist-item-visibility": "Ocultar/mostrar item",
  "broadcast.add-webpage-playlist-item": "Adicionar site",
  "broadcast.add-media-asset-playlist-item": "Adicionar mídia da biblioteca",
  "broadcast.add-news-playlist-item": "Adicionar bloco de notícias",
  "broadcast.add-agenda-event-playlist-item": "Adicionar evento de agenda",
  "broadcast.add-metrics-board-playlist-item": "Adicionar painel de métricas",
  "broadcast.add-scanned-playlist-items": "Adicionar itens da pasta",
  "broadcast.publish-alert": "Publicar aviso rápido",
  "broadcast.publish-takeover": "Publicar comunicado de urgência",
};

function useCaseLabel(useCase: string): string {
  return USE_CASE_LABELS[useCase] ?? useCase;
}

const STATUS_INFO: Record<BroadcastContentChangeStatus, { label: string; tone: StatusTone }> = {
  pending: { label: "Pendente", tone: "warning" },
  approved: { label: "Aprovado", tone: "success" },
  auto_approved: { label: "Aplicado", tone: "success" },
  rejected: { label: "Rejeitado", tone: "muted" },
  cancelled: { label: "Cancelado", tone: "muted" },
  failed: { label: "Falhou ao aplicar", tone: "warning" },
};

// Formatação genérica de payload/snapshot — os 12 useCases têm formas bem diferentes (item único
// de playlist, alerta, lista de itens de reorder...), então em vez de um diff dedicado por tipo
// isto lista os campos preenchidos como "campo: valor". Não é bonito pra todo mundo, mas é
// completo e correto pra qualquer forma nova que apareça sem precisar de código novo aqui.
function formatSnapshot(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) return `${value.length} ${value.length === 1 ? "item" : "itens"}`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([key, v]) => key !== "actorId" && v !== null && v !== undefined && v !== "",
    );
    if (entries.length === 0) return "—";
    return entries.map(([key, v]) => `${key}: ${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ");
  }
  return String(value);
}

function formatDateTime(value: Date): string {
  return new Date(value).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Botão "Rejeitar" — abre diálogo pedindo motivo (obrigatório, ver reject-content-change/handler).
function RejectChangeButton({ changeId }: { changeId: string }) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(rejectContentChangeAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Alteração rejeitada.", onSuccess: () => setOpen(false) });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline">
          Rejeitar
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rejeitar alteração</DialogTitle>
          <DialogDescription>Quem propôs vai ver este motivo em "Minhas alterações".</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="changeId" value={changeId} />
          <Textarea name="reason" placeholder="Por que esta alteração não deve ir ao ar?" rows={3} required autoFocus />
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>
            Confirmar rejeição
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ApproveChangeButton({ changeId }: { changeId: string }) {
  const [state, formAction, pending] = useActionState(approveContentChangeAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Alteração aprovada e aplicada." });

  return (
    <form action={formAction}>
      <input type="hidden" name="changeId" value={changeId} />
      <Button type="submit" size="sm" disabled={pending}>
        Aprovar
      </Button>
    </form>
  );
}

function CancelChangeButton({ changeId }: { changeId: string }) {
  const [state, formAction, pending] = useActionState(cancelContentChangeAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Proposta cancelada." });

  return (
    <form action={formAction}>
      <input type="hidden" name="changeId" value={changeId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>
        Cancelar proposta
      </Button>
    </form>
  );
}

function ChangeMeta({
  change,
  playlistNameById,
  userNameById,
}: {
  change: BroadcastContentChangeRecord;
  playlistNameById: Record<string, string>;
  userNameById: Record<string, string>;
}) {
  const playlistName = change.playlistId ? (playlistNameById[change.playlistId] ?? "playlist removida") : null;
  const requesterName = userNameById[change.requestedBy] ?? change.requestedBy;
  return (
    <p className="text-xs text-muted-foreground">
      {requesterName} · {formatDateTime(change.requestedAt)}
      {playlistName && <> · {playlistName}</>}
    </p>
  );
}

// Card de uma pendência na fila — mostra o que tinha antes ("o que tirou") e o que foi proposto
// ("o que colocou no lugar"), pedido explícito do usuário no desenho deste recurso.
function PendingChangeCard({
  change,
  playlistNameById,
  userNameById,
}: {
  change: BroadcastContentChangeRecord;
  playlistNameById: Record<string, string>;
  userNameById: Record<string, string>;
}) {
  return (
    <Card className="gap-2">
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-sm">{useCaseLabel(change.useCase)}</CardTitle>
          <div className="flex gap-2">
            <ApproveChangeButton changeId={change.id} />
            <RejectChangeButton changeId={change.id} />
          </div>
        </div>
        <ChangeMeta change={change} playlistNameById={playlistNameById} userNameById={userNameById} />
      </CardHeader>
      <CardContent className="space-y-1 text-sm">
        {change.previousSnapshot != null && (
          <p>
            <span className="text-muted-foreground">Antes:</span> {formatSnapshot(change.previousSnapshot)}
          </p>
        )}
        <p>
          <span className="text-muted-foreground">Proposto:</span> {formatSnapshot(change.payload)}
        </p>
      </CardContent>
    </Card>
  );
}

// Fila de aprovação — só o que está `pending`. Vazia = nada esperando decisão.
export function ApprovalQueueSection({
  pendingChanges,
  playlistNameById,
  userNameById,
}: {
  pendingChanges: BroadcastContentChangeRecord[];
  playlistNameById: Record<string, string>;
  userNameById: Record<string, string>;
}) {
  if (pendingChanges.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma alteração aguardando aprovação.</p>;
  }
  return (
    <div className="space-y-2">
      {pendingChanges.map((change) => (
        <PendingChangeCard key={change.id} change={change} playlistNameById={playlistNameById} userNameById={userNameById} />
      ))}
    </div>
  );
}

// Log de auditoria completo — todo status, mais recente primeiro (já vem assim de
// listContentChangeLog). Só leitura: nenhuma ação aqui, mesmo pra pendentes (isso é na fila acima).
export function ContentChangeLogSection({
  changes,
  playlistNameById,
  userNameById,
}: {
  changes: BroadcastContentChangeRecord[];
  playlistNameById: Record<string, string>;
  userNameById: Record<string, string>;
}) {
  if (changes.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma alteração registrada ainda.</p>;
  }
  return (
    <div className="space-y-1.5">
      {changes.map((change) => {
        const status = STATUS_INFO[change.status];
        const decider = change.decidedBy ? (userNameById[change.decidedBy] ?? change.decidedBy) : null;
        return (
          <div key={change.id} className="space-y-1 rounded-panel border border-border p-2.5 text-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-medium text-foreground">{useCaseLabel(change.useCase)}</span>
              <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            </div>
            <ChangeMeta change={change} playlistNameById={playlistNameById} userNameById={userNameById} />
            <p className="text-muted-foreground">{formatSnapshot(change.payload)}</p>
            {change.status === "rejected" && change.rejectionReason && (
              <p className="text-xs text-muted-foreground">
                Rejeitado por {decider ?? "—"}: {change.rejectionReason}
              </p>
            )}
            {change.status === "failed" && change.failureReason && (
              <p className="text-xs text-warning">Falhou: {change.failureReason}</p>
            )}
            {(change.status === "approved" || change.status === "auto_approved") && decider && change.status === "approved" && (
              <p className="text-xs text-muted-foreground">Aprovado por {decider}.</p>
            )}
          </div>
        );
      })}
    </div>
  );
}

// "Minhas alterações" — pro operador escopado (broadcast.playlists.manage sem broadcast.manage)
// ver o que ele propôs: pendente, aprovado, rejeitado (com motivo) ou cancelado. Embutido na aba
// "Playlists atribuídas" (playlists-section.tsx), não numa aba própria — é pouco conteúdo pra
// justificar uma aba a mais pra quem já vê poucas abas.
export function MyContentChangesPanel({
  changes,
  playlistNameById,
}: {
  changes: BroadcastContentChangeRecord[];
  playlistNameById: Record<string, string>;
}) {
  const id = useId();
  if (changes.length === 0) return null;

  return (
    <div className="space-y-2 rounded-panel border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Minhas alterações</p>
      <p className="text-xs text-muted-foreground">
        Alterações de playlist que você propôs — ficam pendentes até um administrador aprovar.
      </p>
      <div className="space-y-1.5">
        {changes.map((change) => {
          const status = STATUS_INFO[change.status];
          const playlistName = change.playlistId ? (playlistNameById[change.playlistId] ?? "playlist removida") : null;
          return (
            <div key={`${id}-${change.id}`} className="space-y-1 rounded-panel border border-border/60 p-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium text-foreground">{useCaseLabel(change.useCase)}</span>
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
              </div>
              <p className="text-xs text-muted-foreground">
                {formatDateTime(change.requestedAt)}
                {playlistName && <> · {playlistName}</>}
              </p>
              <p className="text-muted-foreground">{formatSnapshot(change.payload)}</p>
              {change.status === "rejected" && change.rejectionReason && (
                <p className="text-xs text-warning">Rejeitado: {change.rejectionReason}</p>
              )}
              {change.status === "pending" && <CancelChangeButton changeId={change.id} />}
            </div>
          );
        })}
      </div>
    </div>
  );
}
