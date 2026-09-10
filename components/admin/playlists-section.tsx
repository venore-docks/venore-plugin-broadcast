"use client";

import { useActionState, useEffect, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Clapperboard,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Copy,
  Eye,
  EyeOff,
  Gauge,
  Globe,
  MoreVertical,
  Newspaper,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Tv,
  Upload,
  Image as ImageIcon,
} from "lucide-react";
import { Button } from "@venore/plugin-sdk/ui";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@venore/plugin-sdk/ui";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@venore/plugin-sdk/ui";
import { Input } from "@venore/plugin-sdk/ui";
import { MediaPickerField } from "@venore/plugin-sdk/ui";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
import { ConfirmAlertDialog, ConfirmDeleteButton } from "./confirm-delete-form";
import { ListDropdownBadge } from "./list-badge";
import { SortableList } from "./sortable-list";
// Importa direto de contracts/ e shared/, nunca do barrel (@/plugins/broadcast) — mesmo racional
// de outputs-section.tsx/layer-renderer.tsx: este é um "use client" component, e o barrel arrasta
// handlers server-only pro bundle do browser.
import { streamableContentTypeForExtension } from "../../shared/video-extensions";
import { resolveEventOccurrenceDate } from "../../shared/weekly-recurrence";
import type {
  BroadcastAgendaEventRecord,
  BroadcastAgendaRecord,
  BroadcastPlaylistItemRecord,
  BroadcastPlaylistRecord,
} from "../../contracts/types";
import { STATUS_BORDER_CLASSNAME, StatusBadge } from "./status-dot";
import { playlistItemStatus } from "./status";
import {
  addAgendaEventPlaylistItemAction,
  addMediaAssetPlaylistItemAction,
  addMetricsBoardPlaylistItemAction,
  addNewsPlaylistItemAction,
  addScannedPlaylistItemsAction,
  addWebpagePlaylistItemAction,
  checkWebpageEmbeddableAction,
  createPlaylistAction,
  duplicatePlaylistAction,
  getPlaybackStatsAction,
  getVideosFolderHealthAction,
  listMetricsBoardOptionsAction,
  deletePlaylistAction,
  deletePlaylistItemAction,
  reorderPlaylistItemsAction,
  scanPlaylistFolderAction,
  togglePlaylistItemVisibilityAction,
  updatePlaylistItemAction,
  type BroadcastActionState,
  type ScanPlaylistFolderState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };
const initialScanState: ScanPlaylistFolderState = { error: null, toAdd: [], toRemove: [] };

// A pasta de vídeos não é mais escolhida aqui — toda playlist já nasce apontando pra
// public/broadcast/videos (BROADCAST_VIDEOS_FOLDER_PATH), o "Escanear pasta" de cada uma decide
// qual subconjunto desses arquivos entra. Feedback direto: "a pasta sempre vai ser
// public/broadcast/videos" — o campo era um passo a mais sem utilidade real.
function CreatePlaylistForm() {
  const [state, formAction, pending] = useActionState(createPlaylistAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Playlist criada." });

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-panel border border-border bg-card p-3">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="playlist-name">Nome</label>
        <Input id="playlist-name" name="name" placeholder="Comerciais" required className="w-56" />
      </div>
      <Button type="submit" disabled={pending}>Nova playlist</Button>
    </form>
  );
}

function DuplicatePlaylistButton({ playlistId }: { playlistId: string }) {
  const [state, formAction, pending] = useActionState(duplicatePlaylistAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Playlist duplicada." });
  return (
    <form action={formAction}>
      <input type="hidden" name="playlistId" value={playlistId} />
      <Button type="submit" variant="ghost" size="icon" disabled={pending} aria-label="Duplicar playlist">
        <Copy className="size-4" />
      </Button>
    </form>
  );
}

function relativeDays(iso: string): string {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 30) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  return `há ${months} ${months === 1 ? "mês" : "meses"}`;
}

// Selo de saúde da pasta compartilhada de vídeos — lido uma vez ao abrir a aba. Sinaliza cedo
// "a pasta sumiu / o compartilhamento caiu" em vez de o operador só descobrir no "Escanear pasta".
function VideosFolderHealthBadge() {
  const [health, setHealth] = useState<Awaited<ReturnType<typeof getVideosFolderHealthAction>>>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getVideosFolderHealthAction().then((value) => {
      if (!cancelled) {
        setHealth(value);
        setLoaded(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!loaded) return null;
  if (!health || !health.exists) {
    return (
      <p className="text-xs text-warning">
        ⚠️ A pasta de vídeos do servidor não foi encontrada — confira se o compartilhamento de rede está acessível.
      </p>
    );
  }

  const gb = health.totalBytes / 1024 ** 3;
  const size = gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(health.totalBytes / 1024 ** 2)} MB`;
  return (
    <p className="text-xs text-muted-foreground">
      Pasta de vídeos: {health.videoCount} {health.videoCount === 1 ? "vídeo" : "vídeos"} · {size}
      {health.lastModifiedAt ? ` · alterada ${relativeDays(health.lastModifiedAt)}` : ""}
      {health.otherFileCount > 0
        ? ` · ${health.otherFileCount} arquivo${health.otherFileCount === 1 ? "" : "s"} não-vídeo ignorado${health.otherFileCount === 1 ? "" : "s"}`
        : ""}
    </p>
  );
}

// Relatório de exibições (proof-of-play) — carrega sob demanda ao abrir o <details>. Os números
// vêm do beacon das TVs (uma linha por vez que um item começa a tocar).
function PlaybackReportPanel() {
  const [sinceDays, setSinceDays] = useState(7);
  const [data, setData] = useState<Awaited<ReturnType<typeof getPlaybackStatsAction>>>(null);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    getPlaybackStatsAction(sinceDays).then((result) => {
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, sinceDays]);

  return (
    <details className="rounded-panel border border-border bg-card p-3" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer text-sm font-medium text-foreground">Relatório de exibições</summary>
      <div className="mt-3 space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Período:</span>
          {[7, 30, 90].map((days) => (
            <button
              key={days}
              type="button"
              onClick={() => setSinceDays(days)}
              className={`rounded-full border px-2 py-0.5 text-xs ${
                sinceDays === days ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
              }`}
            >
              {days} dias
            </button>
          ))}
        </div>
        {loading && <p className="text-xs text-muted-foreground">Carregando…</p>}
        {!loading && data && data.stats.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nenhuma exibição registrada no período. Os dados começam a ser coletados quando as TVs reportam o que estão tocando.
          </p>
        )}
        {!loading && data && data.stats.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">{data.total} exibições no total (top 30 itens).</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-muted-foreground">
                    <th className="py-1 pr-2 font-medium">Item</th>
                    <th className="py-1 pr-2 text-right font-medium">Exibições</th>
                    <th className="py-1 text-right font-medium">Telas</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.map((stat) => (
                    <tr key={stat.itemLabel} className="border-t border-border/60">
                      <td className="py-1 pr-2 text-foreground">{stat.itemLabel}</td>
                      <td className="py-1 pr-2 text-right tabular-nums text-foreground">{stat.plays}</td>
                      <td className="py-1 text-right tabular-nums text-muted-foreground">{stat.screens}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </details>
  );
}

function DeletePlaylistButton({ playlistId, outputNames }: { playlistId: string; outputNames: string[] }) {
  // Nomeia o estrago — pedido explícito: "Apagar esta playlist? 2 telas ficam sem conteúdo: X, Y".
  const description =
    outputNames.length > 0
      ? `Apagar esta playlist e todos os seus itens? ${outputNames.length === 1 ? "A tela" : "As telas"} ${outputNames.join(
          ", ",
        )} ${outputNames.length === 1 ? "fica" : "ficam"} sem conteúdo até você apontar pra outra playlist.`
      : "Apagar esta playlist e todos os seus itens? Nenhuma tela toca ela no momento.";
  return (
    <ConfirmDeleteButton
      action={deletePlaylistAction}
      fields={{ playlistId }}
      title="Apagar playlist"
      description={description}
      successMessage="Playlist removida."
      icon={<Trash2 className="size-4" />}
      label="Apagar playlist"
    />
  );
}

function DeletePlaylistItemButton({ itemId }: { itemId: string }) {
  return (
    <ConfirmDeleteButton
      action={deletePlaylistItemAction}
      fields={{ itemId }}
      title="Remover item"
      description="Remover este item da playlist?"
      confirmLabel="Remover"
      successMessage="Item removido."
      icon={<Trash2 className="size-4" />}
      label="Remover item"
    />
  );
}

// Esconder/mostrar + remover atrás de um único menu (pedido explícito: "use cards, dropdown,
// sanfona") — antes eram dois ícones sempre visíveis na linha; junto com a alça de arrastar e o
// lápis de editar, cinco ícones por item era ruído demais. Cada ação continua sendo o mesmo
// server action de sempre (togglePlaylistItemVisibilityAction/deletePlaylistItemAction), só que
// disparado via requestSubmit() num form escondido em vez de um <button type="submit"> visível —
// mesmo padrão já usado em admin/media/_components/delete-media-button.tsx.
function PlaylistItemActionsMenu({ item }: { item: BroadcastPlaylistItemRecord }) {
  const [toggleState, toggleAction, togglePending] = useActionState(togglePlaylistItemVisibilityAction, initialState);
  useActionToast({ pending: togglePending, error: toggleState.error, successMessage: item.hidden ? "Item exibido de novo." : "Item escondido." });
  const toggleFormRef = useRef<HTMLFormElement>(null);

  const [deleteState, deleteAction, deletePending] = useActionState(deletePlaylistItemAction, initialState);
  useActionToast({ pending: deletePending, error: deleteState.error, successMessage: "Item removido." });
  const deleteFormRef = useRef<HTMLFormElement>(null);
  // "Remover item" abre o AlertDialog em vez de submeter na hora — o próprio DropdownMenu já
  // fecha sozinho ao selecionar um item (comportamento padrão do Radix); o diálogo de confirmação
  // abre por cima, controlado por este estado local (mesmo padrão documentado em
  // confirm-delete-form.tsx, só que aqui o gatilho é um item de menu, não um botão isolado).
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <>
      <form ref={toggleFormRef} action={toggleAction} className="hidden">
        <input type="hidden" name="itemId" value={item.id} />
        <input type="hidden" name="hidden" value={item.hidden ? "false" : "true"} />
      </form>
      <form ref={deleteFormRef} action={deleteAction} className="hidden">
        <input type="hidden" name="itemId" value={item.id} />
      </form>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="icon"
            disabled={togglePending || deletePending}
            aria-label="Mais ações do item"
            // Mesmo sinal de aviso de antes quando escondido, agora no próprio gatilho do menu.
            className={item.hidden ? "border-warning-border bg-warning-soft text-warning hover:bg-warning-soft" : undefined}
          >
            <MoreVertical className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => toggleFormRef.current?.requestSubmit()}>
            {item.hidden ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {item.hidden ? "Mostrar item" : "Esconder item"}
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmOpen(true)}>
            <Trash2 className="size-4" />
            Remover item
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmAlertDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={() => {
          setConfirmOpen(false);
          deleteFormRef.current?.requestSubmit();
        }}
        title="Remover item"
        description="Remover este item da playlist?"
        confirmLabel="Remover"
        pending={deletePending}
      />
    </>
  );
}

function extensionOf(relativePath: string): string {
  const dot = relativePath.lastIndexOf(".");
  return dot === -1 ? "" : relativePath.slice(dot);
}

// Ícone por tipo de item — "local" resolve vídeo/imagem pela extensão (mesma allowlist do
// streaming); "media-asset" fica com um ícone genérico de imagem, já que o registro da playlist
// não carrega o contentType do asset (evitaria uma consulta extra só pra decidir um ícone).
// Retorna o elemento já renderizado (não o componente) — react-hooks/static-components não aceita
// <Icon /> com uma referência de componente calculada em runtime dentro do render.
function renderItemIcon(item: BroadcastPlaylistItemRecord): ReactNode {
  const className = "size-4";
  if (item.sourceType === "webpage") return <Globe className={className} aria-hidden="true" />;
  if (item.sourceType === "news") return <Newspaper className={className} aria-hidden="true" />;
  if (item.sourceType === "agenda-event") return <CalendarDays className={className} aria-hidden="true" />;
  if (item.sourceType === "local" && item.relativePath) {
    const contentType = streamableContentTypeForExtension(extensionOf(item.relativePath));
    if (contentType?.startsWith("video/")) return <Clapperboard className={className} aria-hidden="true" />;
  }
  return <ImageIcon className={className} aria-hidden="true" />;
}

// Campos empilhados verticalmente (label em cima, campo largura cheia) em vez de
// flex-wrap/items-end lado a lado — o layout horizontal quebrava (campos se sobrepondo/
// desalinhando) dentro do card estreito de edição; empilhado nunca depende da largura disponível
// pra ficar legível. Só título/duração/url (quando "webpage") são editáveis —
// relativePath/mediaAssetId/sourceType não, pra não deixar um item de playlist ambíguo (trocar o
// arquivo é "outro item", ver comentário do CHECK de forma no schema).
// Aviso antecipado "este site carrega dentro de um iframe na TV?" — botão explícito (não no blur,
// pra não disparar uma requisição de saída a cada vez que o campo perde o foco). Só aviso, nunca
// bloqueia adicionar. Ver features/playlists/check-webpage-embeddable.
function WebpageEmbedHint({ url }: { url: string }) {
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Awaited<ReturnType<typeof checkWebpageEmbeddableAction>>>(null);
  const lastCheckedRef = useRef<string | null>(null);

  async function run() {
    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith("/") || !trimmed.startsWith("http")) {
      setResult(null);
      return;
    }
    if (trimmed === lastCheckedRef.current) return;
    lastCheckedRef.current = trimmed;
    setChecking(true);
    setResult(await checkWebpageEmbeddableAction(trimmed));
    setChecking(false);
  }

  if (!url.trim().startsWith("http")) return null;

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={run}
        disabled={checking}
        className="text-xs font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
      >
        Verificar se carrega na TV
      </button>
      {checking && <p className="text-xs text-muted-foreground">Verificando…</p>}
      {result?.embeddable === "likely-blocked" && (
        <p className="text-xs text-warning">
          ⚠️ Provavelmente não carrega na TV — {result.reason}. Rotas internas do próprio site sempre funcionam.
        </p>
      )}
      {result?.embeddable === "yes" && (
        <p className="text-xs text-success">Respondeu sem bloqueio de embed — deve carregar na TV.</p>
      )}
      {result?.embeddable === "unknown" && (
        <p className="text-xs text-muted-foreground">Não deu pra verificar (o site não respondeu a tempo) — teste pelo link acima.</p>
      )}
    </div>
  );
}

function EditPlaylistItemForm({ item, onDone }: { item: BroadcastPlaylistItemRecord; onDone: () => void }) {
  const [state, formAction, pending] = useActionState(updatePlaylistItemAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Item atualizado.", onSuccess: onDone });
  const [url, setUrl] = useState(item.url ?? "");
  const isVideo =
    item.sourceType === "local" && item.relativePath
      ? Boolean(streamableContentTypeForExtension(extensionOf(item.relativePath))?.startsWith("video/"))
      : false;
  // "webpage" e "media-asset" (vídeo ou imagem — não dá pra saber sem resolver a mídia; a caixa é
  // no-op numa imagem) além do vídeo local.
  const audioCapable = item.sourceType === "webpage" || item.sourceType === "media-asset" || isVideo;

  return (
    <form
      key={`${item.id}-${item.updatedAt.getTime()}`}
      action={formAction}
      className="mt-2 space-y-3 rounded-panel border border-border/60 bg-muted/30 p-3"
    >
      <input type="hidden" name="itemId" value={item.id} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${item.id}-edit-title`}>Título</label>
        <Input id={`${item.id}-edit-title`} name="title" defaultValue={item.title ?? ""} className="w-full" />
      </div>
      {item.sourceType === "webpage" && (
        <div className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${item.id}-edit-url`}>Site ou rota interna</label>
            {url.startsWith("http") && (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
              >
                Testar
              </a>
            )}
          </div>
          <Input
            id={`${item.id}-edit-url`}
            name="url"
            required
            className="w-full"
            value={url}
            onChange={(event) => setUrl(event.target.value)}
          />
          <WebpageEmbedHint url={url} />
        </div>
      )}
      {/* Duração não se aplica a vídeo (toca pela duração natural do arquivo). */}
      {!isVideo && (
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${item.id}-edit-duration`}>Segundos na tela</label>
          <Input
            id={`${item.id}-edit-duration`}
            name="durationSeconds"
            type="number"
            defaultValue={item.durationSeconds ?? undefined}
            className="w-32"
          />
        </div>
      )}
      {audioCapable && <AudioToggleField defaultChecked={item.withAudio} />}
      {/* Validade opcional — o item só toca na TV entre as duas datas. Vazio = sem limite.
          Interpretado no fuso da instituição (broadcast.timezone), igual às datas da agenda. */}
      <div className="space-y-1">
        <p className="text-xs font-medium text-muted-foreground">Validade na TV (opcional)</p>
        <div className="flex flex-wrap gap-2">
          <label className="space-y-0.5 text-xs text-muted-foreground">
            <span className="block">Aparece a partir de</span>
            <Input
              name="visibleFrom"
              type="datetime-local"
              defaultValue={toDatetimeLocalValue(item.visibleFrom)}
              className="w-52"
            />
          </label>
          <label className="space-y-0.5 text-xs text-muted-foreground">
            <span className="block">Some depois de</span>
            <Input
              name="visibleUntil"
              type="datetime-local"
              defaultValue={toDatetimeLocalValue(item.visibleUntil)}
              className="w-52"
            />
          </label>
        </div>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={pending}>Salvar</Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>Cancelar</Button>
      </div>
    </form>
  );
}

// <input type="datetime-local"> espera "YYYY-MM-DDTHH:mm" em horário local (getters locais do
// Date, não toISOString) — mesmo helper/racional de toDatetimeLocalValue em agenda-section.tsx.
function toDatetimeLocalValue(value: Date | string | null): string {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Descreve a janela de validade de um item pra lista — null quando o item não tem janela nenhuma.
// outOfWindow marca "não está tocando agora por causa da validade" (agendado pro futuro ou já
// expirado) — pinta o item de âmbar, igual ao `hidden`.
function describeValidityWindow(item: BroadcastPlaylistItemRecord): { label: string; outOfWindow: boolean } | null {
  if (!item.visibleFrom && !item.visibleUntil) return null;
  const fmt = (value: Date | string) =>
    new Date(value).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  const now = Date.now();
  const fromMs = item.visibleFrom ? new Date(item.visibleFrom).getTime() : null;
  const untilMs = item.visibleUntil ? new Date(item.visibleUntil).getTime() : null;

  if (fromMs != null && fromMs > now) return { label: `⏳ agendado para ${fmt(item.visibleFrom as Date)}`, outOfWindow: true };
  if (untilMs != null && untilMs < now) return { label: `⛔ expirou em ${fmt(item.visibleUntil as Date)}`, outOfWindow: true };
  if (untilMs != null) return { label: `visível até ${fmt(item.visibleUntil as Date)}`, outOfWindow: false };
  return { label: `visível desde ${fmt(item.visibleFrom as Date)}`, outOfWindow: false };
}

function PlaylistItemRow({
  item,
  agendaEventById,
  dragHandle,
  dragRootProps,
  setNodeRef,
  style,
  isDragging,
}: {
  item: BroadcastPlaylistItemRecord;
  agendaEventById: Record<string, BroadcastAgendaEventRecord>;
  dragHandle: ReactNode;
  dragRootProps: HTMLAttributes<HTMLElement>;
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const validity = describeValidityWindow(item);
  const referencedEventTitle = item.agendaEventId ? agendaEventById[item.agendaEventId]?.title : undefined;
  const label =
    item.title ??
    item.relativePath ??
    item.url ??
    referencedEventTitle ??
    (item.sourceType === "news" ? "Bloco de notícias" : item.sourceType === "agenda-event" ? "Evento da agenda" : "Item da biblioteca de mídia (sem título)");
  const sourceLabel =
    item.sourceType === "local"
      ? "pasta do servidor"
      : item.sourceType === "webpage"
        ? "página web"
        : item.sourceType === "news"
          ? "notícias da região (rotativo)"
          : item.sourceType === "agenda-event"
            ? "evento da agenda (em destaque)"
            : "biblioteca de mídia";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...dragRootProps}
      // Item escondido ganha o mesmo tom de aviso já usado no gatilho do menu de ações — dá pra
      // notar "isto não toca na TV" olhando a lista inteira, sem precisar abrir o menu de cada
      // item pra descobrir.
      className={`touch-none rounded-panel border p-2.5 text-sm cursor-grab active:cursor-grabbing ${
        item.hidden || validity?.outOfWindow ? "border-warning-border bg-warning-soft/40" : "border-border bg-card"
      } ${isDragging ? "opacity-60" : ""}`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          {dragHandle}
          <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent/14 text-foreground">
            {renderItemIcon(item)}
          </span>
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{label}</p>
            <p className="truncate text-xs text-muted-foreground">
              {sourceLabel}
              {item.durationSeconds != null && ` · ${item.durationSeconds}s`}
              {item.hidden && " · escondido"}
            </p>
            {validity && <p className={`truncate text-xs ${validity.outOfWindow ? "text-warning" : "text-muted-foreground"}`}>{validity.label}</p>}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setEditing((previous) => !previous)}
            aria-label={editing ? "Fechar edição" : "Editar item"}
          >
            <Pencil className="size-4" />
          </Button>
          <PlaylistItemActionsMenu item={item} />
        </div>
      </div>
      {editing && <EditPlaylistItemForm item={item} onDone={() => setEditing(false)} />}
    </div>
  );
}

// Arrasta pra reordenar (SortableList, ver sortable-list.tsx) — mantém uma ordem local otimista
// (order) que reage na hora ao arrasto, sem esperar o servidor confirmar; o formulário escondido
// dispara reorderPlaylistItemsAction de verdade (mesmo mecanismo de "reenviar a lista inteira" de
// antes) via requestSubmit() logo depois. serverOrder ressincroniza a ordem local sempre que a
// playlist muda de fora (item adicionado/removido, ou o servidor confirmando o próprio drag).
function SortablePlaylistItems({
  playlistId,
  items,
  agendaEventById,
}: {
  playlistId: string;
  items: BroadcastPlaylistItemRecord[];
  agendaEventById: Record<string, BroadcastAgendaEventRecord>;
}) {
  const [state, formAction, pending] = useActionState(reorderPlaylistItemsAction, initialState);
  useActionToast({ pending, error: state.error });
  const formRef = useRef<HTMLFormElement>(null);
  const itemIdsInputRef = useRef<HTMLInputElement>(null);

  const serverOrder = useMemo(() => items.map((item) => item.id), [items]);
  const [order, setOrder] = useState(serverOrder);
  // Ressincroniza a ordem local sempre que a playlist muda de fora (item adicionado/removido, ou
  // o servidor confirmando o próprio drag) — setState direto no corpo do render, não num efeito
  // (react-hooks/set-state-in-effect): mesmo padrão que o próprio React recomenda pra "ajustar
  // estado quando uma prop muda", guardado por uma comparação de conteúdo (não de referência, já
  // que serverOrder é um array novo a cada render).
  const [prevServerOrder, setPrevServerOrder] = useState(serverOrder);
  if (serverOrder.join(",") !== prevServerOrder.join(",")) {
    setPrevServerOrder(serverOrder);
    setOrder(serverOrder);
  }
  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);

  function handleReorder(nextOrder: string[]) {
    setOrder(nextOrder);
    if (itemIdsInputRef.current) itemIdsInputRef.current.value = JSON.stringify(nextOrder);
    formRef.current?.requestSubmit();
  }

  return (
    <div className="space-y-2">
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="playlistId" value={playlistId} />
        <input type="hidden" name="itemIds" ref={itemIdsInputRef} defaultValue={JSON.stringify(serverOrder)} />
      </form>
      <SortableList ids={order} onReorder={handleReorder}>
        {(id, { setNodeRef, style, dragRootProps, dragHandle, isDragging }) => {
          const item = itemById.get(id);
          if (!item) return null;
          return (
            <PlaylistItemRow
              item={item}
              agendaEventById={agendaEventById}
              dragHandle={dragHandle}
              dragRootProps={dragRootProps}
              setNodeRef={setNodeRef}
              style={style}
              isDragging={isDragging}
            />
          );
        }}
      </SortableList>
    </div>
  );
}

// Escanear a pasta agora só mostra uma prévia (nada é gravado) — o operador escolhe quais vídeos
// novos entram (checkbox, tudo pré-marcado) e confirma; itens que sumiram da pasta aparecem à
// parte, com o botão de apagar já existente, nunca removidos sozinhos. Pedido explícito: "quero
// poder escolher o que entra na playlist e o que não entra" — o scan antigo inseria/apagava tudo
// automaticamente.
function ScanPlaylistFlow({ playlistId, onAdded }: { playlistId: string; onAdded?: () => void }) {
  const [scanState, scanAction, scanPending] = useActionState(scanPlaylistFolderAction, initialScanState);
  const [preview, setPreview] = useState<ScanPlaylistFolderState | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  useActionToast({
    pending: scanPending,
    error: scanState.error,
    onSuccess: () => {
      setPreview(scanState);
      setSelected(new Set(scanState.toAdd));
    },
  });

  const [addState, addAction, addPending] = useActionState(addScannedPlaylistItemsAction, initialState);
  useActionToast({
    pending: addPending,
    error: addState.error,
    successMessage: "Vídeos adicionados.",
    onSuccess: () => {
      setPreview(null);
      onAdded?.();
    },
  });

  function toggle(relativePath: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(relativePath)) next.delete(relativePath);
      else next.add(relativePath);
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Escaneia a pasta configurada e mostra o que encontrou — você escolhe o que entra na playlist.
      </p>
      <form action={scanAction}>
        <input type="hidden" name="playlistId" value={playlistId} />
        <Button type="submit" variant="outline" size="sm" disabled={scanPending} className="w-full sm:w-auto">
          <RefreshCw className="size-4" />
          Escanear pasta
        </Button>
      </form>

      {preview && (
        <div className="space-y-3 rounded-panel border border-border/60 bg-card p-3">
          {preview.toAdd.length === 0 && preview.toRemove.length === 0 && (
            <p className="text-xs text-muted-foreground">Nenhuma novidade — a playlist já reflete o que está na pasta.</p>
          )}

          {preview.toAdd.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-foreground">
                {preview.toAdd.length} vídeo{preview.toAdd.length === 1 ? "" : "s"} encontrado{preview.toAdd.length === 1 ? "" : "s"} na
                pasta — escolha o que entra:
              </p>
              <ul className="max-h-48 space-y-1 overflow-y-auto">
                {preview.toAdd.map((relativePath) => (
                  <li key={relativePath}>
                    <label className="flex items-center gap-2 rounded-md p-1.5 text-sm text-foreground hover:bg-muted/60">
                      <input
                        type="checkbox"
                        checked={selected.has(relativePath)}
                        onChange={() => toggle(relativePath)}
                        className="size-4 shrink-0 rounded border-border"
                      />
                      <span className="min-w-0 truncate">{relativePath}</span>
                    </label>
                  </li>
                ))}
              </ul>
              <form action={addAction} className="flex flex-wrap items-center gap-2">
                <input type="hidden" name="playlistId" value={playlistId} />
                <input type="hidden" name="relativePaths" value={JSON.stringify([...selected])} />
                <Button type="submit" size="sm" disabled={addPending || selected.size === 0}>
                  Adicionar selecionados ({selected.size})
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setPreview(null)}>
                  Cancelar
                </Button>
              </form>
            </div>
          )}

          {preview.toRemove.length > 0 && (
            <div className="space-y-1.5 border-t border-border/60 pt-2">
              <p className="text-xs font-medium text-warning">
                {preview.toRemove.length} item{preview.toRemove.length === 1 ? "" : "s"} da playlist não{" "}
                {preview.toRemove.length === 1 ? "foi encontrado" : "foram encontrados"} mais na pasta:
              </p>
              {preview.toRemove.map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span className="min-w-0 truncate">{item.relativePath}</span>
                  <DeletePlaylistItemButton itemId={item.id} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Checkbox "Tocar áudio na TV" — só faz sentido p/ vídeo e "webpage". O <video> da view sai
// `muted` por padrão (exigência de autoplay do navegador); ligado aqui, toca com som e o <iframe>
// ganha allow="autoplay" — mas só funciona de fato num navegador de TV/kiosk configurado pra
// permitir áudio automático (ex: Chrome com --autoplay-policy=no-user-gesture-required). Se o
// navegador bloquear, o vídeo volta a tocar mudo sozinho, sem travar a playlist.
function AudioToggleField({ defaultChecked = false }: { defaultChecked?: boolean }) {
  return (
    <div className="space-y-1">
      <label className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        <input type="checkbox" name="withAudio" defaultChecked={defaultChecked} className="size-4 shrink-0 rounded border-border" />
        Tocar áudio na TV
      </label>
      <p className="text-xs text-muted-foreground">
        Vídeo e páginas web tocam sem som por padrão. Só funciona se o navegador da TV estiver configurado para permitir áudio
        automático.
      </p>
    </div>
  );
}

// Envia um vídeo do computador do operador direto pra pasta compartilhada de vídeos
// (public/broadcast/videos) — o servidor grava no MESMO compartilhamento de rede que já é usado
// largando arquivo na mão, então o arquivo fica visível pra quem usa a pasta pela rede e entra no
// "Escanear pasta" de qualquer playlist. Não é uma server action: o corpo é o arquivo cru (GB),
// vai por XMLHttpRequest pra ter barra de progresso (fetch não expõe progresso de upload). No
// sucesso, router.refresh() recarrega os server components da página (não há revalidatePath aqui).
const MAX_UPLOAD_BYTES_CLIENT = 4 * 1024 * 1024 * 1024;

function UploadVideoForm({ playlistId, onAdded }: { playlistId: string; onAdded?: () => void }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFile(file: File) {
    setError(null);
    if (file.size > MAX_UPLOAD_BYTES_CLIENT) {
      setError("Arquivo maior que 4 GB — largue-o direto na pasta de vídeos pela rede.");
      return;
    }
    setProgress(0);

    const params = new URLSearchParams({ playlistId, filename: file.name });
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `/api/broadcast/upload?${params.toString()}`);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) setProgress(Math.round((event.loaded / event.total) * 100));
    };
    xhr.onload = () => {
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
      if (xhr.status >= 200 && xhr.status < 300) {
        router.refresh();
        onAdded?.();
        return;
      }
      try {
        setError((JSON.parse(xhr.responseText) as { error?: string }).error ?? "Falha no envio.");
      } catch {
        setError("Falha no envio.");
      }
    };
    xhr.onerror = () => {
      setProgress(null);
      setError("Falha de rede no envio.");
    };
    xhr.send(file);
  }

  const uploading = progress !== null;

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">
        O vídeo vai pra pasta compartilhada de vídeos do servidor — o mesmo lugar de quando alguém larga um arquivo na pasta pela
        rede. Ele já entra nesta playlist e fica disponível pro &quot;Escanear pasta&quot; das outras.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept=".mp4,.webm,video/mp4,video/webm"
        disabled={uploading}
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) handleFile(file);
        }}
        className="block w-full text-sm text-foreground file:mr-3 file:rounded-md file:border file:border-border file:bg-card file:px-3 file:py-1.5 file:text-sm file:text-foreground"
      />
      {uploading && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <p className="text-xs text-muted-foreground">Enviando… {progress}%</p>
        </div>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function AddMediaAssetItemForm({ playlistId, onAdded }: { playlistId: string; onAdded?: () => void }) {
  const [state, formAction, pending] = useActionState(addMediaAssetPlaylistItemAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Item adicionado.", onSuccess: onAdded });

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="playlistId" value={playlistId} />
      <MediaPickerField name="mediaAssetId" label="Vídeo ou imagem da biblioteca" />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-media-title`}>Título (opcional)</label>
        <Input id={`${playlistId}-media-title`} name="title" className="w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-media-duration`}>
          Segundos na tela (só p/ imagem)
        </label>
        <Input id={`${playlistId}-media-duration`} name="durationSeconds" type="number" placeholder="15" className="w-32" />
      </div>
      <AudioToggleField />
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">Adicionar</Button>
    </form>
  );
}

function AddWebpageItemForm({ playlistId, onAdded }: { playlistId: string; onAdded?: () => void }) {
  const [state, formAction, pending] = useActionState(addWebpagePlaylistItemAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Página adicionada.", onSuccess: onAdded });
  // Controlado só pra habilitar o link "Testar" com a URL atual — a submissão continua via
  // FormData (name="url"), igual às outras <Input> não controladas deste arquivo.
  const [url, setUrl] = useState("");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="playlistId" value={playlistId} />
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-2">
          <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-webpage-url`}>Site ou rota interna</label>
          {url.startsWith("http") && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              Testar
            </a>
          )}
        </div>
        <Input
          id={`${playlistId}-webpage-url`}
          name="url"
          placeholder="https://... ou /cursos"
          required
          className="w-full"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-webpage-title`}>Título (opcional)</label>
        <Input id={`${playlistId}-webpage-title`} name="title" className="w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-webpage-duration`}>
          Segundos na tela (padrão 60)
        </label>
        <Input id={`${playlistId}-webpage-duration`} name="durationSeconds" type="number" placeholder="60" className="w-32" />
      </div>
      <p className="text-xs text-warning">
        Muitos sites (Google, redes sociais, bancos) bloqueiam ser exibidos dentro de outra página e vão ficar em branco na TV.
        Rotas internas do próprio site sempre funcionam.
      </p>
      <WebpageEmbedHint url={url} />
      <AudioToggleField />
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">Adicionar</Button>
    </form>
  );
}

function AddNewsItemForm({ playlistId, onAdded }: { playlistId: string; onAdded?: () => void }) {
  const [state, formAction, pending] = useActionState(addNewsPlaylistItemAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Bloco de notícias adicionado.", onSuccess: onAdded });

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="playlistId" value={playlistId} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-news-title`}>Título (opcional)</label>
        <Input id={`${playlistId}-news-title`} name="title" placeholder="Notícias" className="w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-news-duration`}>
          Segundos do bloco (padrão 30)
        </label>
        <Input id={`${playlistId}-news-duration`} name="durationSeconds" type="number" placeholder="30" className="w-32" />
      </div>
      <Button type="submit" disabled={pending} className="w-full sm:w-auto">Adicionar</Button>
    </form>
  );
}

// Data de exibição de cada evento no picker — mesma resolução usada na view de saída
// (resolveEventOccurrenceDate, puro/sem I/O): um evento recorrente mostra a PRÓXIMA ocorrência
// real, nunca a âncora crua gravada no banco, senão o operador veria uma data que já passou.
function formatEventPickerDate(event: BroadcastAgendaEventRecord): string {
  const date = resolveEventOccurrenceDate(event);
  const day = date.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }).replace(".", "");
  const time = date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return event.recurring ? `toda ${date.toLocaleDateString("pt-BR", { weekday: "long" })}, ${time}` : `${day}, ${time}`;
}

// Único item que referencia um evento específico (agendaEventId), não um arquivo/URL — o picker
// agrupa por agenda (SelectGroup/SelectLabel) pra achar o evento certo quando há várias agendas
// cadastradas. Mesmo padrão de Select controlado + hidden input de agenda-section.tsx (Radix Select
// não é um <select> nativo, precisa de um input próprio pra entrar no FormData da action).
function AddAgendaEventItemForm({
  playlistId,
  agendas,
  agendaEvents,
  onAdded,
}: {
  playlistId: string;
  agendas: BroadcastAgendaRecord[];
  agendaEvents: BroadcastAgendaEventRecord[];
  onAdded?: () => void;
}) {
  const [state, formAction, pending] = useActionState(addAgendaEventPlaylistItemAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Evento adicionado.", onSuccess: onAdded });
  const [agendaEventId, setAgendaEventId] = useState("");

  const eventsByAgendaId = useMemo(() => {
    const map = new Map<string, BroadcastAgendaEventRecord[]>();
    for (const event of agendaEvents) {
      const bucket = map.get(event.agendaId) ?? [];
      bucket.push(event);
      map.set(event.agendaId, bucket);
    }
    return map;
  }, [agendaEvents]);

  if (agendaEvents.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhum evento cadastrado ainda — crie um na aba Agenda primeiro.</p>;
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="playlistId" value={playlistId} />
      <input type="hidden" name="agendaEventId" value={agendaEventId} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Evento</label>
        <Select value={agendaEventId} onValueChange={setAgendaEventId}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Escolha um evento" />
          </SelectTrigger>
          <SelectContent>
            {agendas.map((agenda) => {
              const events = eventsByAgendaId.get(agenda.id) ?? [];
              if (events.length === 0) return null;
              return (
                <SelectGroup key={agenda.id}>
                  <SelectLabel>{agenda.name}</SelectLabel>
                  {events.map((event) => (
                    <SelectItem key={event.id} value={event.id}>
                      {event.title} — {formatEventPickerDate(event)}
                    </SelectItem>
                  ))}
                </SelectGroup>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-agenda-event-duration`}>
          Segundos na tela (padrão 20)
        </label>
        <Input id={`${playlistId}-agenda-event-duration`} name="durationSeconds" type="number" placeholder="20" className="w-32" />
      </div>
      <Button type="submit" disabled={pending || !agendaEventId} className="w-full sm:w-auto">Adicionar</Button>
    </form>
  );
}

type AddItemKind = "scan" | "upload" | "media" | "webpage" | "news" | "agenda-event" | "metrics-board";

// Ícone renderizado (não componente) — mesmo racional de renderItemIcon.
function renderAddOptionIcon(kind: AddItemKind): ReactNode {
  const className = "size-3.5";
  switch (kind) {
    case "scan":
      return <Clapperboard className={className} aria-hidden="true" />;
    case "upload":
      return <Upload className={className} aria-hidden="true" />;
    case "media":
      return <ImageIcon className={className} aria-hidden="true" />;
    case "webpage":
      return <Globe className={className} aria-hidden="true" />;
    case "news":
      return <Newspaper className={className} aria-hidden="true" />;
    case "agenda-event":
      return <CalendarDays className={className} aria-hidden="true" />;
    case "metrics-board":
      return <Gauge className={className} aria-hidden="true" />;
  }
}

// Atalho "Painel de métricas" (§9.3): só aparece quando o plugin company-metrics está ativo E
// tem ao menos um painel — listMetricsBoardOptionsAction devolve [] caso contrário. Insere um
// item "webpage" apontando pra /company-metrics/tv/{token}, sem o operador colar URL.
function AddMetricsBoardItemForm({
  playlistId,
  boards,
  onAdded,
}: {
  playlistId: string;
  boards: { token: string; label: string }[];
  onAdded?: () => void;
}) {
  const [state, formAction, pending] = useActionState(addMetricsBoardPlaylistItemAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Painel de métricas adicionado.", onSuccess: onAdded });
  const [boardToken, setBoardToken] = useState(boards[0]?.token ?? "");

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="playlistId" value={playlistId} />
      <input type="hidden" name="boardToken" value={boardToken} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground">Painel</label>
        <Select value={boardToken} onValueChange={setBoardToken}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="selecione..." />
          </SelectTrigger>
          <SelectContent>
            {boards.map((board) => (
              <SelectItem key={board.token} value={board.token}>
                {board.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-mb-title`}>Título (opcional)</label>
        <Input id={`${playlistId}-mb-title`} name="title" className="w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${playlistId}-mb-duration`}>
          Segundos na tela (padrão 60)
        </label>
        <Input id={`${playlistId}-mb-duration`} name="durationSeconds" type="number" placeholder="60" className="w-32" />
      </div>
      <Button type="submit" disabled={pending || !boardToken} className="w-full sm:w-auto">Adicionar</Button>
    </form>
  );
}

// Chips (um por tipo de conteúdo) + um único formulário visível por vez, em vez dos quatro
// formulários sempre abertos lado a lado — reduz o ruído visual e dá largura cheia pro formulário
// ativo (a causa raiz do card de "página web" quebrado era espaço insuficiente numa grade de 2
// colunas; com só um formulário por vez, ele sempre tem a largura inteira da seção).
function PlaylistAddSection({
  playlist,
  agendas,
  agendaEvents,
}: {
  playlist: BroadcastPlaylistRecord;
  agendas: BroadcastAgendaRecord[];
  agendaEvents: BroadcastAgendaEventRecord[];
}) {
  const [active, setActive] = useState<AddItemKind | null>(null);
  const close = () => setActive(null);

  // Painéis de métricas (§9.3) — carregados sob demanda; [] quando o plugin company-metrics não
  // está ativo ou não há painel, e aí o chip nem aparece.
  const [metricsBoards, setMetricsBoards] = useState<{ token: string; label: string }[]>([]);
  useEffect(() => {
    let cancelled = false;
    listMetricsBoardOptionsAction().then((boards) => {
      if (!cancelled) setMetricsBoards(boards);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const options: { kind: AddItemKind; label: string }[] = [
    { kind: "upload", label: "Enviar vídeo" },
    ...(playlist.folderPath ? [{ kind: "scan" as const, label: "Vídeos da pasta" }] : []),
    { kind: "media", label: "Mídia avulsa" },
    { kind: "webpage", label: "Página web" },
    { kind: "news", label: "Bloco de notícias" },
    { kind: "agenda-event", label: "Evento em destaque" },
    ...(metricsBoards.length > 0 ? [{ kind: "metrics-board" as const, label: "Painel de métricas" }] : []),
  ];

  return (
    <div className="space-y-3 border-t border-border/60 pt-3">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Adicionar à playlist</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <button
            key={option.kind}
            type="button"
            onClick={() => setActive((current) => (current === option.kind ? null : option.kind))}
            className={
              active === option.kind
                ? "flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary ui-motion-base"
                : "flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground ui-motion-base hover:border-ring"
            }
          >
            {renderAddOptionIcon(option.kind)}
            {option.label}
          </button>
        ))}
      </div>

      {active && (
        <div className="rounded-panel border border-border/60 bg-muted/20 p-3">
          {active === "upload" && <UploadVideoForm playlistId={playlist.id} onAdded={close} />}
          {active === "scan" && <ScanPlaylistFlow playlistId={playlist.id} onAdded={close} />}
          {active === "media" && <AddMediaAssetItemForm playlistId={playlist.id} onAdded={close} />}
          {active === "webpage" && <AddWebpageItemForm playlistId={playlist.id} onAdded={close} />}
          {active === "news" && <AddNewsItemForm playlistId={playlist.id} onAdded={close} />}
          {active === "agenda-event" && (
            <AddAgendaEventItemForm playlistId={playlist.id} agendas={agendas} agendaEvents={agendaEvents} onAdded={close} />
          )}
          {active === "metrics-board" && (
            <AddMetricsBoardItemForm playlistId={playlist.id} boards={metricsBoards} onAdded={close} />
          )}
        </div>
      )}
    </div>
  );
}

// Mesmo modelo de card das Telas (outputs-section.tsx) — pedido explícito: "vamos aplicar o mesmo
// modelo de cards para as Playlists". Card fechável (botão na CardAction, não mais Accordion:
// aqui quem controla aberto/fechado é o operador, não um disclosure nativo) mantendo Nome + badge
// de status sempre visíveis; CardContent (itens + adicionar) some quando fechado; CardFooter com
// o "Adicionar item" continua de pé mesmo fechado — mesma ideia de "Copiar link" em Telas: a ação
// mais comum do card, sempre alcançável, com cor própria (primary sólido) pra deixar claro que é
// ali. Estado só local (não persiste entre reloads), mesmo racional de OutputCard.
function PlaylistCard({
  playlist,
  items,
  agendas,
  agendaEvents,
  agendaEventById,
  outputNames,
  canManageAll,
}: {
  playlist: BroadcastPlaylistRecord;
  items: BroadcastPlaylistItemRecord[];
  agendas: BroadcastAgendaRecord[];
  agendaEvents: BroadcastAgendaEventRecord[];
  agendaEventById: Record<string, BroadcastAgendaEventRecord>;
  outputNames: string[];
  canManageAll: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const status = playlistItemStatus(items.length);

  return (
    <Card className={`gap-3 border-l-4 ${STATUS_BORDER_CLASSNAME[status.tone]}`}>
      <CardHeader>
        <CardTitle className="truncate">{playlist.name}</CardTitle>
        <CardAction className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed((previous) => !previous)}
            aria-label={collapsed ? "Expandir playlist" : "Recolher playlist"}
          >
            {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
          </Button>
          {canManageAll && <DuplicatePlaylistButton playlistId={playlist.id} />}
          {/* Playlist dedicada (ownerOutputId) não é apagável aqui — ela morre junto com a tela
              (delete-output). Só playlist compartilhada (criada à mão) tem o botão. */}
          {canManageAll && !playlist.ownerOutputId && (
            <DeletePlaylistButton playlistId={playlist.id} outputNames={outputNames} />
          )}
        </CardAction>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
          {playlist.ownerOutputId && (
            <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              <Tv className="size-3" aria-hidden="true" />
              {outputNames[0] ? `playlist da tela ${outputNames[0]}` : "playlist dedicada a uma tela"}
            </span>
          )}
          {/* Pedido explícito: "adiciona uma badge mostrando [...] a quantidade de lugares onde
              essa playlist é usada. Quando clicar, mostra os locais (Telas cadastradas)" — mesmo
              padrão do badge de TVs conectadas em outputs-section.tsx (ListDropdownBadge), só que
              aqui o "onde" é telas em vez de IPs. */}
          <ListDropdownBadge
            tone={outputNames.length > 0 ? "success" : "muted"}
            label={
              <>
                <Tv className="size-3" aria-hidden="true" />
                {outputNames.length} {outputNames.length === 1 ? "tela" : "telas"}
              </>
            }
            items={outputNames}
          />
        </div>
      </CardHeader>
      {!collapsed && (
        <CardContent className="space-y-4">
          <div className="space-y-1.5">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Itens</p>
            <p className="text-xs text-muted-foreground">A ordem aqui é a ordem de reprodução na tela.</p>
            {items.length > 0 ? (
              <SortablePlaylistItems playlistId={playlist.id} items={items} agendaEventById={agendaEventById} />
            ) : (
              <p className="text-xs text-muted-foreground">
                {playlist.folderPath ? 'Nenhum vídeo ainda — clique em "Vídeos da pasta" abaixo pra escanear.' : "Nenhum item ainda."}
              </p>
            )}
          </div>
          <div className="border-t border-border/60 pt-4">
            <PlaylistAddSection playlist={playlist} agendas={agendas} agendaEvents={agendaEvents} />
          </div>
        </CardContent>
      )}
      <CardFooter className="border-t-primary/20 bg-primary/8">
        <Button type="button" variant="default" size="sm" className="w-full" onClick={() => setCollapsed(false)}>
          <Plus className="size-4" />
          Adicionar item
        </Button>
      </CardFooter>
    </Card>
  );
}

export function PlaylistsSection({
  playlists,
  itemsByPlaylist,
  agendas = [],
  agendaEvents = [],
  outputNamesByPlaylistId = {},
  canManageAll = true,
}: {
  playlists: BroadcastPlaylistRecord[];
  itemsByPlaylist: Record<string, BroadcastPlaylistItemRecord[]>;
  // Usados só pelo picker do item "Evento em destaque" (e pro rótulo dele na lista) — default []
  // pra não quebrar quem já chamava PlaylistsSection sem esses dois props.
  agendas?: BroadcastAgendaRecord[];
  agendaEvents?: BroadcastAgendaEventRecord[];
  // Nome das telas que tocam cada playlist agora (inverso de outputPlaylistById, ver page.tsx) —
  // pedido explícito: "mostra [...] a quantidade de lugares onde essa playlist é usada". Default
  // {} pelo mesmo motivo de agendas/agendaEvents acima.
  outputNamesByPlaylistId?: Record<string, string[]>;
  // false pra um ator sem broadcast.manage (só broadcast.playlists.manage — "responsável" por
  // playlists específicas, ver page.tsx) — esconde criar/apagar playlist, que continuam ação de
  // quem administra tudo (mesmo racional de canManageAll em agenda-section.tsx/outputs-section.tsx).
  canManageAll?: boolean;
}) {
  const agendaEventById = useMemo(
    () => Object.fromEntries(agendaEvents.map((event) => [event.id, event])),
    [agendaEvents],
  );

  return (
    <div className="space-y-4">
      <VideosFolderHealthBadge />
      {canManageAll && <PlaybackReportPanel />}
      {canManageAll && <CreatePlaylistForm />}
      {playlists.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {canManageAll ? "Nenhuma playlist cadastrada ainda." : "Nenhuma playlist foi atribuída a você ainda."}
        </p>
      )}
      {/* Grid de cards, mesmo padrão de Telas — mobile primeiro (1 coluna), 2 a partir de sm, 3 a
          partir de xl (AGENTS.md seção 4). items-start evita o esticamento padrão do Grid (ver
          outputs-section.tsx): sem isso, abrir uma playlist numa linha esticaria as outras da
          mesma linha pro mesmo tamanho, mesmo fechadas. */}
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {playlists.map((playlist) => (
          <PlaylistCard
            key={playlist.id}
            playlist={playlist}
            items={itemsByPlaylist[playlist.id] ?? []}
            agendas={agendas}
            agendaEvents={agendaEvents}
            agendaEventById={agendaEventById}
            outputNames={outputNamesByPlaylistId[playlist.id] ?? []}
            canManageAll={canManageAll}
          />
        ))}
      </div>
    </div>
  );
}
