"use client";

import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import * as QRCode from "qrcode";
import {
  Check,
  Clock,
  Copy,
  CopyPlus,
  ExternalLink,
  EyeOff,
  KeyRound,
  Layers,
  Link2,
  ListVideo,
  Palette,
  PanelBottomClose,
  PanelBottomOpen,
  PanelRightClose,
  PanelRightOpen,
  Plus,
  Power,
  PowerOff,
  QrCode,
  RotateCw,
  ScrollText,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  Trash2,
  Tv,
} from "lucide-react";
import { Button } from "@venore/plugin-sdk/ui";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@venore/plugin-sdk/ui";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@venore/plugin-sdk/ui";
import { Input } from "@venore/plugin-sdk/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@venore/plugin-sdk/ui";
import { Slider } from "@venore/plugin-sdk/ui";
import { Switch } from "@venore/plugin-sdk/ui";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
import type { PickableMedia } from "@venore/plugin-sdk/ui";
import { ConfirmDeleteButton } from "./confirm-delete-form";
import { ListDropdownBadge } from "./list-badge";
import { MasterDetail, useUrlParam, type MasterDetailEntry } from "./master-detail";
import { PlaylistAddSection, SortablePlaylistItems, VideosFolderHealthBadge } from "./playlists-section";
// Importa direto de contracts/ e shared/, nunca do barrel (@/plugins/broadcast) — mesmo racional
// de playlists-section.tsx/agenda-section.tsx.
import type {
  BroadcastAgendaEventRecord,
  BroadcastAgendaRecord,
  BroadcastOutputRecord,
  BroadcastPlaylistItemRecord,
  BroadcastPlaylistRecord,
  BroadcastPlaylistScheduleSlot,
} from "../../contracts/types";
import type { OutputBeaconSummary } from "../../runtime/output-beacon";
import { DAY_LABELS, minutesToTimeLabel, parseTimeToMinutes } from "../../shared/playlist-schedule";
import { StatusBadge } from "./status-dot";
import { outputItemStatus } from "./status";
import {
  bulkOutputActionAction,
  createOutputAction,
  deleteOutputAction,
  duplicateOutputAction,
  setOutputFrozenAction,
  setOutputCardColorAction,
  setOutputGroupAction,
  setSyncedGroupAction,
  getConnectedOutputIpsAction,
  getOutputPinBlocksAction,
  getOutputTelemetryAction,
  reloadOutputAction,
  resetOutputPinAttemptsAction,
  rotateOutputTokenAction,
  setOutputAgendaScheduleAction,
  setOutputFallbackAction,
  setOutputHoursAction,
  setOutputPlaylistScheduleAction,
  setOutputDrawerAction,
  setOutputFooterAction,
  setOutputOfflineAction,
  setOutputPinAction,
  setOutputPlaylistAction,
  setOutputTickerAction,
  type BroadcastActionState,
  type BroadcastOutputToggleState,
  type SetOutputPlaylistState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };
// Toggles de controle ao vivo: a action devolve a saída atualizada (ou só o id da playlist) em vez
// de chamar revalidatePath — o componente reflete o clique na hora e reconcilia com este retorno.
// Ver o comentário em actions.ts.
const outputToggleInitialState: BroadcastOutputToggleState = { error: null, output: null };
const playlistInitialState: SetOutputPlaylistState = { error: null, playlistId: null };

// Toda saída nasce com sua cena/camadas fixas já prontas (vídeo + agenda + aviso rápido) E com a
// própria playlist dedicada ("Playlist da <tela>", modelo 1:1 — ver create-output/store.ts). O
// operador dá o nome e escolhe um modelo (só ajusta visibilidade inicial da agenda/rodapé — tudo
// mutável depois no card).
function CreateOutputForm() {
  const [state, formAction, pending] = useActionState(createOutputAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Tela criada — a playlist dela já foi criada junto." });
  const [template, setTemplate] = useState("completo");

  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2 rounded-panel border border-border bg-card p-3">
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="output-name">Nome</label>
        <Input id="output-name" name="name" placeholder="TV da recepção" required className="w-56" />
      </div>
      <div className="space-y-1">
        <label className="text-xs text-muted-foreground" htmlFor="output-template">Modelo</label>
        <input type="hidden" name="template" value={template} />
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger id="output-template" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="completo">Completo (vídeo + agenda + rodapé)</SelectItem>
            <SelectItem value="video-rodape">Vídeo + rodapé (sem agenda)</SelectItem>
            <SelectItem value="video">Só vídeo (tela cheia)</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <Button type="submit" disabled={pending}>Nova tela</Button>
    </form>
  );
}

// navigator.clipboard só existe em contexto seguro (HTTPS ou localhost). O build deste plugin é
// servido por HTTP na LAN (o cenário-alvo — servidor local), onde navigator.clipboard é undefined:
// sem este guard o clique quebrava com "Cannot read properties of undefined (reading 'writeText')".
// Fallback: <textarea> fora da tela + execCommand("copy"), que funciona em HTTP; e se nem isso,
// o chamador mostra o link pra cópia manual.
async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // cai no fallback abaixo
  }
  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}

// Cor própria (variant="default", primary sólido) em vez do outline neutro de antes — pedido
// explícito: "deixe esse botão com outra cor, essa seção do card deve demonstrar para o usuário
// que é ali que ele precisa copiar o link". w-full pra ocupar o rodapé inteiro, reforçando que é
// a ação principal do card, não mais um botão secundário entre outros.
function CopyOutputUrlButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  // Bug real reportado: este componente ainda gerava a URL pré-migração (/broadcast/out/:token),
  // que nunca existiu depois que a rota de saída virou o dispatcher genérico /ext/... (ver
  // routes/route-table.ts) — o botão "Copiar link da TV" estava entregando um link que sempre dava
  // 404, ninguém tinha como perceber sem abrir o link.
  const path = `/ext/broadcast/out/${token}`;

  return (
    <Button
      type="button"
      variant={copied ? "outline" : "default"}
      size="sm"
      className="w-full"
      onClick={() => {
        const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
        void copyTextToClipboard(url).then((ok) => {
          if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } else {
            window.prompt("Copie o link da TV:", url);
          }
        });
      }}
    >
      {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      {copied ? "Link copiado" : "Copiar link da TV"}
    </Button>
  );
}

// QR code do link da TV — digitar `http://192.168.x.x/ext/broadcast/out/recepcao` num controle
// remoto de TV é o passo mais penoso do fluxo. Com o QR, aponta a câmera do celular (ou um leitor
// na própria TV) e abre. Gera sob demanda no primeiro "abrir" (o `qrcode` roda no browser e
// devolve um PNG data URL) — mesmo URL que o botão de copiar usa, pra não divergir.
function OutputQrToggle({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  const path = `/ext/broadcast/out/${token}`;
  const fullUrl = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;

  useEffect(() => {
    if (!open || dataUrl) return;
    QRCode.toDataURL(fullUrl, { width: 320, margin: 1 })
      .then(setDataUrl)
      .catch(() => setDataUrl(null));
  }, [open, dataUrl, fullUrl]);

  return (
    <div className="w-full space-y-2">
      <Button type="button" variant="outline" size="sm" className="w-full" onClick={() => setOpen((previous) => !previous)}>
        <QrCode className="size-4" />
        {open ? "Ocultar QR code" : "QR code da TV"}
      </Button>
      {open && (
        <div className="flex flex-col items-center gap-1.5 rounded-panel border border-border bg-card p-3">
          {dataUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- data URL local gerado no client, sem otimização de next/image
            <img src={dataUrl} alt="QR code do link da TV" className="size-40" />
          ) : (
            <p className="text-xs text-muted-foreground">Gerando…</p>
          )}
          <p className="break-all text-center text-xs text-muted-foreground">{fullUrl}</p>
        </div>
      )}
    </div>
  );
}

// Cover do card — pedido explícito: "coloque cover image ou preview no lugar da cover imagem".
// Tela não tem um campo de imagem de capa próprio (não é um recurso de mídia), então a capa É o
// preview ao vivo da própria saída; por padrão mostra só um retângulo neutro com o ícone de TV
// (equivalente a "sem capa"), e vira o iframe de verdade só quando o operador pede — mount-on-
// demand de propósito, preservado do preview antigo: cada preview aberto é uma página de saída
// inteira rodando (SSE + polling próprios, ver output-canvas.tsx), não algo pra manter sempre
// ativo pra cada card da grade. Dimensão de design da view de saída é 1280×720 (16:9) — como agora
// a capa ocupa a largura inteira do card (responsiva, varia por breakpoint), o fator de escala é
// medido de verdade via ResizeObserver em vez de uma largura de caixa fixa como antes.
const PREVIEW_DESIGN_WIDTH = 1280;
const PREVIEW_DESIGN_HEIGHT = 720;

function useElementWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) setWidth(entry.contentRect.width);
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, width] as const;
}

function OutputCoverPreview({ token }: { token: string }) {
  const [open, setOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [containerRef, width] = useElementWidth();
  const scale = width > 0 ? width / PREVIEW_DESIGN_WIDTH : 0;

  return (
    <>
    {/* Simulador em tela cheia — a mesma view de saída (SSE + polling próprios), escalada pro
        viewport. Só um preview grande; o operador vê a playlist ciclar sem uma TV real. */}
    {fullscreen && (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4">
        <div
          className="relative shadow-2xl"
          style={{
            width: PREVIEW_DESIGN_WIDTH,
            height: PREVIEW_DESIGN_HEIGHT,
            transform: `scale(${Math.min(
              (typeof window !== "undefined" ? window.innerWidth - 32 : PREVIEW_DESIGN_WIDTH) / PREVIEW_DESIGN_WIDTH,
              (typeof window !== "undefined" ? window.innerHeight - 32 : PREVIEW_DESIGN_HEIGHT) / PREVIEW_DESIGN_HEIGHT,
            )})`,
          }}
        >
          <iframe
            src={`/ext/broadcast/out/${token}`}
            title="Simulador da tela"
            style={{ width: PREVIEW_DESIGN_WIDTH, height: PREVIEW_DESIGN_HEIGHT, border: 0 }}
          />
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="absolute top-4 right-4"
          onClick={() => setFullscreen(false)}
        >
          Fechar
        </Button>
      </div>
    )}
    <div
      // Só -mt (cancela o py do Card) — Card não tem padding horizontal próprio (só as seções
      // internas — CardHeader/CardContent/CardFooter — têm px), então a capa já nasce com a
      // largura cheia do card sem precisar de -mx nenhum; overflow-hidden + rounded-xl do Card
      // arredondam o topo automaticamente, mesmo racional do has-[>img:first-child]:pt-0 que o
      // componente já prevê pra uma imagem de capa de verdade.
      ref={containerRef}
      className="relative -mt-(--card-spacing) aspect-video min-h-40 overflow-hidden bg-muted"
    >
      {open && scale > 0 ? (
        <>
          <iframe
            // Mesmo bug/fix de CopyOutputUrlButton acima — o preview ao vivo do card também
            // apontava pra URL pré-migração.
            src={`/ext/broadcast/out/${token}`}
            title="Preview da tela"
            style={{
              width: PREVIEW_DESIGN_WIDTH,
              height: PREVIEW_DESIGN_HEIGHT,
              transform: `scale(${scale})`,
              transformOrigin: "top left",
              border: 0,
              pointerEvents: "none",
            }}
          />
          <div className="absolute top-2 right-2 flex gap-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-card/90"
              onClick={() => setFullscreen(true)}
            >
              Tela cheia
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="bg-card/90"
              onClick={() => setOpen(false)}
              aria-label="Fechar preview"
            >
              <EyeOff className="size-4" />
            </Button>
          </div>
        </>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex size-full flex-col items-center justify-center gap-1.5 text-muted-foreground ui-motion-base hover:bg-accent/10 hover:text-foreground"
        >
          <Tv className="size-8" aria-hidden="true" />
          <span className="text-xs font-medium">Ver preview</span>
        </button>
      )}
    </div>
    </>
  );
}

// Troca ao selecionar (sem botão "trocar"). v1.8.1: sem fluxo otimista — escreve no input
// escondido, submete, e a action faz revalidatePath; a página volta com o estado real. O
// otimismo de antes estava revertendo pra "playlist própria" em alguns casos (bug reportado).
function SetOutputPlaylistForm({
  output,
  playlists,
  currentPlaylistId,
}: {
  output: BroadcastOutputRecord;
  playlists: BroadcastPlaylistRecord[];
  currentPlaylistId: string | null;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const playlistIdInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(setOutputPlaylistAction, playlistInitialState);
  useActionToast({ pending, error: state.error, successMessage: "Playlist trocada." });

  function handleChange(playlistId: string) {
    if (playlistIdInputRef.current) playlistIdInputRef.current.value = playlistId;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction}>
      <input type="hidden" name="outputId" value={output.id} />
      <input type="hidden" name="playlistId" ref={playlistIdInputRef} defaultValue={currentPlaylistId ?? ""} />
      <Select value={currentPlaylistId ?? undefined} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Escolha uma playlist..." />
        </SelectTrigger>
        <SelectContent>
          {playlists.map((playlist) => (
            <SelectItem key={playlist.id} value={playlist.id}>
              {playlist.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </form>
  );
}

type LayerTone = "primary" | "accent" | "warning";

const LAYER_TONE_ICON_CLASSNAME: Record<LayerTone, string> = {
  primary: "bg-primary/14 text-primary",
  accent: "bg-accent/14 text-accent",
  warning: "bg-warning-soft text-warning",
};

// data-checked:bg-primary já é o default do Switch (switch.tsx) — sem override pra esse tom.
const LAYER_TONE_SWITCH_CLASSNAME: Record<LayerTone, string> = {
  primary: "",
  accent: "data-checked:bg-accent",
  warning: "data-checked:bg-warning",
};

// Uma linha por camada (agenda/rodapé/ticker), todas com a MESMA estrutura — ícone + nome +
// descrição do que aquilo faz + Switch — pedido explícito: "a seção de camadas tem um contexto bom,
// mas os botões não conversam entre si" (antes eram três botões-pílula com cores/tamanhos
// diferentes, cada um "gritando" sozinho). Agora é uma lista única, cada linha só troca de ícone/
// cor/texto — o mesmo padrão se repetindo é o que faz elas "conversarem". Switch em vez de botão
// texto+ícone: pedido explícito "vamos evitar inputs diretos" — um Switch já entrega ligado/
// desligado sem precisar ler texto nenhum. Clique dobrado ignorado via pendingRef, mesmo padrão de
// AdminNavSwitch (src/themes/*/components/AdminNavSwitch.tsx); <label htmlFor> aponta só pro
// Switch (não envolve ícone+Switch) pelo mesmo motivo documentado lá — Radix Switch renderiza
// botão + checkbox oculto como irmãos, dois elementos "labelable" no mesmo <label> é ambíguo.
function LayerToggleRow({
  output,
  action,
  fieldName,
  checked: serverChecked,
  iconOn,
  iconOff,
  label,
  description,
  tone,
  onCheckedChange,
}: {
  output: BroadcastOutputRecord;
  // A action devolve BroadcastOutputToggleState (saída atualizada) e NÃO chama revalidatePath — o
  // Switch reflete o clique na hora e reconcilia com o registro devolvido. Ver actions.ts.
  action: (state: BroadcastActionState, formData: FormData) => Promise<BroadcastOutputToggleState>;
  fieldName: "drawerOpen" | "footerOpen" | "tickerEnabled" | "offline" | "frozen";
  checked: boolean;
  iconOn: ReactNode;
  iconOff: ReactNode;
  label: string;
  description: string;
  tone: LayerTone;
  onCheckedChange?: (checked: boolean) => void;
}) {
  // Estado do Switch: otimista no clique, confirmado pelo fim da action. Sem revalidatePath, então
  // uma revalidação estrutural (create/delete/reorder ainda recarregam a página) volta a mandar
  // via `key` no OutputCard, que remonta esta linha com o `serverChecked` novo.
  const [checked, setChecked] = useState(serverChecked);
  // Valor pra onde voltar se a action falhar (o valor de antes deste clique).
  const revertToRef = useRef(serverChecked);
  const pendingRef = useRef(false);

  function applyChecked(next: boolean) {
    setChecked(next);
    onCheckedChange?.(next);
  }

  const [state, formAction, pending] = useActionState(action, outputToggleInitialState);
  useActionToast({
    pending,
    error: state.error,
    successMessage: "Atualizado.",
    onSuccess: () => {
      pendingRef.current = false;
    },
    onError: () => {
      pendingRef.current = false;
      applyChecked(revertToRef.current);
    },
  });
  const formRef = useRef<HTMLFormElement>(null);
  const valueInputRef = useRef<HTMLInputElement>(null);
  const id = useId();

  function handleChange(next: boolean) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    revertToRef.current = checked;
    if (valueInputRef.current) valueInputRef.current.value = next ? "true" : "false";
    applyChecked(next);
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="bg-card p-3">
      <input type="hidden" name="outputId" value={output.id} />
      <input type="hidden" name={fieldName} ref={valueInputRef} defaultValue={serverChecked ? "false" : "true"} />
      <div className="flex items-center gap-2.5">
        <span
          className={`flex size-8 shrink-0 items-center justify-center rounded-full ${checked ? LAYER_TONE_ICON_CLASSNAME[tone] : "bg-muted text-muted-foreground"}`}
        >
          {checked ? iconOn : iconOff}
        </span>
        <label htmlFor={id} className="min-w-0 flex-1 cursor-pointer">
          <span className="block text-sm font-medium text-foreground">{label}</span>
          <span className="block truncate text-xs text-muted-foreground">{description}</span>
        </label>
        <Switch
          id={id}
          checked={checked}
          onCheckedChange={handleChange}
          disabled={pending}
          className={LAYER_TONE_SWITCH_CLASSNAME[tone]}
          aria-label={label}
        />
      </div>
    </form>
  );
}

function formatMinutesSeconds(totalSeconds: number): string {
  if (totalSeconds <= 0) return "desligado";
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  if (seconds === 0) return `${minutes} min`;
  return `${minutes} min ${seconds}s`;
}

const SCHEDULE_MAX_SECONDS = 600;
const SCHEDULE_STEP_SECONDS = 15;

// Ciclo fixo de abrir/pausar a coluna lateral — pedido explícito: "quero escolher quando essa
// pausa acontece [...] deixar a agenda aberta por uns 3 min, depois 1 min de pausa" (correção de
// uma 1ª versão que pausava depois de CADA agenda individual, sem controle sobre quando). Slider em
// vez de campo numérico — pedido explícito: "no lugar de um input de texto para segundos, talvez
// um slider" — arrastar e soltar já salva sozinho (onValueCommit), sem precisar de um botão
// "Salvar" à parte.
//
// Os dois campos continuam formando um par — só um preenchido não liga o ciclo, o server rejeita
// (ver set-output-agenda-schedule/service.ts). Com um <input type="number"> isso não travava nada
// (dava pra digitar os dois antes de clicar em "Salvar"); com dois sliders que salvam sozinhos ao
// soltar, ARRASTAR SÓ UM já dispara o commit sozinho, com o outro ainda em zero — impossível
// configurar o par assim (bug real reportado: "tento colocar um valor [...] diz que preciso
// definir os dois ao mesmo tempo, o que é impossível"). Por isso commit() só chama requestSubmit()
// quando o PAR resultante já é válido (os dois em zero, ou os dois > 0); um valor sozinho só
// atualiza o número mostrado (via onValueChange) e espera o outro slider completar o par — a dica
// abaixo avisa qual dos dois ainda falta.
function SetOutputAgendaScheduleForm({ output }: { output: BroadcastOutputRecord }) {
  const formRef = useRef<HTMLFormElement>(null);
  const openInputRef = useRef<HTMLInputElement>(null);
  const pauseInputRef = useRef<HTMLInputElement>(null);
  const [openSeconds, setOpenSeconds] = useState(output.agendaOpenSeconds ?? 0);
  const [pauseSeconds, setPauseSeconds] = useState(output.agendaPauseSeconds ?? 0);
  // Últimos valores confirmados pelo server — pra onde os sliders voltam se um commit falhar (sem
  // revalidatePath, o prop `output` não recarrega sozinho; revalidação estrutural remonta via `key`
  // no OutputCard). Atualizado no commit: os valores enviados viram o novo "confirmado" assim que a
  // action responde sem erro.
  const confirmedRef = useRef({ open: output.agendaOpenSeconds ?? 0, pause: output.agendaPauseSeconds ?? 0 });
  const sentRef = useRef({ open: output.agendaOpenSeconds ?? 0, pause: output.agendaPauseSeconds ?? 0 });

  const [state, formAction, pending] = useActionState(setOutputAgendaScheduleAction, outputToggleInitialState);
  useActionToast({
    pending,
    error: state.error,
    successMessage: "Ciclo da agenda atualizado.",
    onSuccess: () => {
      confirmedRef.current = sentRef.current;
    },
    onError: () => {
      setOpenSeconds(confirmedRef.current.open);
      setPauseSeconds(confirmedRef.current.pause);
    },
  });

  function commit(nextOpen: number, nextPause: number) {
    const pairIsValid = (nextOpen > 0) === (nextPause > 0);
    if (!pairIsValid) return;
    sentRef.current = { open: nextOpen, pause: nextPause };
    if (openInputRef.current) openInputRef.current.value = nextOpen > 0 ? String(nextOpen) : "";
    if (pauseInputRef.current) pauseInputRef.current.value = nextPause > 0 ? String(nextPause) : "";
    formRef.current?.requestSubmit();
  }

  const hint =
    openSeconds > 0 && pauseSeconds === 0
      ? "Falta ajustar a pausa pra ativar o ciclo."
      : openSeconds === 0 && pauseSeconds > 0
        ? "Falta ajustar quanto tempo fica aberta pra ativar o ciclo."
        : "Deixe os dois em “desligado” pra não pausar — a agenda roda contínua.";
  const hintIsIncomplete = (openSeconds > 0) !== (pauseSeconds > 0);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="outputId" value={output.id} />
      <input type="hidden" name="agendaOpenSeconds" ref={openInputRef} defaultValue={output.agendaOpenSeconds ?? ""} />
      <input type="hidden" name="agendaPauseSeconds" ref={pauseInputRef} defaultValue={output.agendaPauseSeconds ?? ""} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Agenda aberta por</span>
          <span className="font-medium text-foreground">{formatMinutesSeconds(openSeconds)}</span>
        </div>
        <Slider
          value={[openSeconds]}
          max={SCHEDULE_MAX_SECONDS}
          step={SCHEDULE_STEP_SECONDS}
          disabled={pending}
          onValueChange={([value]) => setOpenSeconds(value)}
          onValueCommit={([value]) => commit(value, pauseSeconds)}
        />
      </div>
      <div className="space-y-1.5">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Depois, pausa por</span>
          <span className="font-medium text-foreground">{formatMinutesSeconds(pauseSeconds)}</span>
        </div>
        <Slider
          value={[pauseSeconds]}
          max={SCHEDULE_MAX_SECONDS}
          step={SCHEDULE_STEP_SECONDS}
          disabled={pending}
          onValueChange={([value]) => setPauseSeconds(value)}
          onValueCommit={([value]) => commit(openSeconds, value)}
        />
      </div>
      <p className={`text-xs ${hintIsIncomplete ? "font-medium text-warning" : "text-muted-foreground"}`}>{hint}</p>
    </form>
  );
}

// Dayparting — faixas "de tal hora a tal hora, nestes dias, toca ESTA playlist". Quando um slot
// casa com "agora" (na hora de parede da instituição), a tela troca pra playlist do slot; fora de
// qualquer slot, volta pra playlist padrão da camada de vídeo. Substitui o conjunto inteiro de
// uma vez (setOutputPlaylistScheduleAction), mesmo padrão de "reenviar a lista" das outras seções.
type ScheduleSlotDraft = { days: number; startTime: string; endTime: string; playlistId: string };

function slotToDraft(slot: BroadcastPlaylistScheduleSlot): ScheduleSlotDraft {
  return {
    days: slot.days,
    startTime: minutesToTimeLabel(slot.startMinute),
    endTime: minutesToTimeLabel(slot.endMinute),
    playlistId: slot.playlistId,
  };
}

function OutputScheduleSection({
  output,
  playlists,
  slots: serverSlots,
}: {
  output: BroadcastOutputRecord;
  playlists: BroadcastPlaylistRecord[];
  slots: BroadcastPlaylistScheduleSlot[];
}) {
  const [drafts, setDrafts] = useState<ScheduleSlotDraft[]>(() => serverSlots.map(slotToDraft));
  const formRef = useRef<HTMLFormElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(setOutputPlaylistScheduleAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Programação salva." });

  // Mesma regra do seletor de playlist do card: só a dedicada desta tela + compartilhadas.
  const selectablePlaylists = playlists.filter(
    (playlist) => !playlist.ownerOutputId || playlist.ownerOutputId === output.id,
  );

  function patch(index: number, next: Partial<ScheduleSlotDraft>) {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, ...next } : draft)));
  }
  function toggleDay(index: number, bit: number) {
    setDrafts((current) => current.map((draft, i) => (i === index ? { ...draft, days: draft.days ^ bit } : draft)));
  }
  function addSlot() {
    setDrafts((current) => [
      ...current,
      { days: 0b0111110, startTime: "08:00", endTime: "12:00", playlistId: selectablePlaylists[0]?.id ?? "" },
    ]);
  }
  function removeSlot(index: number) {
    setDrafts((current) => current.filter((_, i) => i !== index));
  }

  function save() {
    const serialized = drafts.map((draft) => ({
      playlistId: draft.playlistId,
      days: draft.days,
      startMinute: parseTimeToMinutes(draft.startTime) ?? -1,
      endMinute: parseTimeToMinutes(draft.endTime) ?? -1,
    }));
    if (jsonRef.current) jsonRef.current.value = JSON.stringify(serialized);
    formRef.current?.requestSubmit();
  }

  const playlistNameById = new Map(playlists.map((playlist) => [playlist.id, playlist.name]));

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Programação por horário</p>
        <p className="text-xs text-muted-foreground">
          Em cada faixa, a tela troca pra playlist escolhida. Fora de qualquer faixa, toca a playlist padrão. Horário da instituição.
        </p>
      </div>

      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="outputId" value={output.id} />
        <input type="hidden" name="slots" ref={jsonRef} defaultValue="[]" />
      </form>

      {drafts.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sem programação — esta tela toca sempre a playlist padrão.</p>
      ) : (
        <div className="space-y-2">
          {drafts.map((draft, index) => (
            <div key={index} className="space-y-2 rounded-panel border border-border bg-card p-2.5">
              <div className="flex flex-wrap gap-1">
                {DAY_LABELS.map((label, dayIndex) => {
                  const bit = 1 << dayIndex;
                  const on = (draft.days & bit) !== 0;
                  return (
                    <button
                      key={label}
                      type="button"
                      onClick={() => toggleDay(index, bit)}
                      className={`rounded-full border px-2 py-0.5 text-xs ${
                        on ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="time"
                  value={draft.startTime}
                  onChange={(event) => patch(index, { startTime: event.target.value })}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                />
                <span className="text-xs text-muted-foreground">até</span>
                <input
                  type="time"
                  value={draft.endTime}
                  onChange={(event) => patch(index, { endTime: event.target.value })}
                  className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeSlot(index)}
                  aria-label="Remover faixa"
                  className="ml-auto"
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
              <Select value={draft.playlistId} onValueChange={(value) => patch(index, { playlistId: value })}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Escolha a playlist desta faixa...">
                    {playlistNameById.get(draft.playlistId) ?? "Escolha a playlist desta faixa..."}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {selectablePlaylists.map((playlist) => (
                    <SelectItem key={playlist.id} value={playlist.id}>
                      {playlist.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addSlot} disabled={selectablePlaylists.length === 0}>
          Adicionar faixa
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={pending}>
          Salvar programação
        </Button>
      </div>
    </div>
  );
}

// Grupo da tela — chip discreto ao lado do nome ("Sem grupo" ou o nome do grupo + ícone quando o
// grupo está sincronizado). Clicar abre um diálogo pra digitar/escolher o grupo ou tirar do grupo.
function OutputGroupControl({
  output,
  allGroups,
  synced,
}: {
  output: BroadcastOutputRecord;
  allGroups: string[];
  synced: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [state, formAction, pending] = useActionState(setOutputGroupAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Grupo salvo.", onSuccess: () => setOpen(false) });
  const listId = useId();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button
          type="button"
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground ui-motion-base hover:border-ring hover:text-foreground"
        >
          {output.groupName ? (
            <>
              {output.groupName}
              {synced && <RotateCw className="size-3" aria-label="reprodução sincronizada" />}
            </>
          ) : (
            "Sem grupo"
          )}
        </button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grupo desta tela</DialogTitle>
          <DialogDescription>
            Telas no mesmo grupo ganham ações em lote e podem tocar sincronizadas (diálogo Grupos, no topo da lista).
          </DialogDescription>
        </DialogHeader>
        <form action={formAction} className="space-y-3">
          <input type="hidden" name="outputId" value={output.id} />
          <Input name="groupName" defaultValue={output.groupName ?? ""} list={listId} placeholder="Ex: Prédio A" autoFocus />
          <datalist id={listId}>
            {allGroups.map((group) => (
              <option key={group} value={group} />
            ))}
          </datalist>
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={pending}>
              Salvar
            </Button>
            {output.groupName && (
              <Button
                type="submit"
                size="sm"
                variant="ghost"
                disabled={pending}
                onClick={(event) => {
                  const form = event.currentTarget.form;
                  const field = form?.elements.namedItem("groupName");
                  if (field instanceof HTMLInputElement) field.value = "";
                }}
              >
                Tirar do grupo
              </Button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// Cor do card — pill pequena à esquerda do nome (mais baixa que o texto do título, não uma bola
// maior que ele). A própria pill é o <input type="color"> (opacidade 0 por cima); mudar salva no
// blur. O "×" ao lado limpa.
function OutputColorControl({ output }: { output: BroadcastOutputRecord }) {
  const formRef = useRef<HTMLFormElement>(null);
  const colorInputRef = useRef<HTMLInputElement>(null);
  const [state, formAction, pending] = useActionState(setOutputCardColorAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Cor salva." });

  function submitWith(value: string) {
    if (colorInputRef.current) colorInputRef.current.value = value;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="flex shrink-0 items-center gap-1">
      <input type="hidden" name="outputId" value={output.id} />
      <input type="hidden" name="cardColor" ref={colorInputRef} defaultValue={output.cardColor ?? ""} />
      <span
        className="relative inline-flex h-4 w-7 items-center justify-center rounded-full border border-border"
        style={output.cardColor ? { background: output.cardColor, borderColor: output.cardColor } : undefined}
        title="Cor do card"
      >
        {!output.cardColor && <Palette className="size-2.5 text-muted-foreground" aria-hidden="true" />}
        <input
          type="color"
          aria-label="Cor do card"
          defaultValue={output.cardColor ?? "#3b82f6"}
          disabled={pending}
          onBlur={(event) => submitWith(event.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </span>
      {output.cardColor && (
        <button
          type="button"
          onClick={() => submitWith("")}
          disabled={pending}
          title="Sem cor"
          className="text-sm leading-none text-muted-foreground ui-motion-base hover:text-foreground"
        >
          ×
        </button>
      )}
    </form>
  );
}

// Painel de grupos — no topo da aba Telas quando existe pelo menos um grupo. Ações em lote sobre
// todas as telas do grupo (gate broadcast.manage no handler).
function GroupBulkButton({ groupName, action, label }: { groupName: string; action: string; label: string }) {
  const [state, formAction, pending] = useActionState(bulkOutputActionAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Aplicado ao grupo." });
  return (
    <form action={formAction}>
      <input type="hidden" name="groupName" value={groupName} />
      <input type="hidden" name="action" value={action} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending}>{label}</Button>
    </form>
  );
}

// Liga/desliga "reprodução sincronizada" de um grupo (v1.8). O Switch é controlado pelo prop
// `enabled` (que vem do setting broadcast.syncedGroups, relido via revalidatePath na action) —
// nada de estado local persistente, que era o bug: o checkbox "desligava" sozinho quando o server
// component re-renderizava. Enquanto a action está no ar mostra só a intenção do clique.
function GroupSyncToggle({ groupName, enabled }: { groupName: string; enabled: boolean }) {
  const formRef = useRef<HTMLFormElement>(null);
  const enabledInputRef = useRef<HTMLInputElement>(null);
  const [pendingValue, setPendingValue] = useState<boolean | null>(null);
  const [state, formAction, pending] = useActionState(setSyncedGroupAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Sincronização atualizada." });
  useEffect(() => {
    if (!pending) setPendingValue(null);
  }, [pending]);
  const id = useId();
  const checked = pending && pendingValue !== null ? pendingValue : enabled;

  function handleChange(next: boolean) {
    setPendingValue(next);
    if (enabledInputRef.current) enabledInputRef.current.value = next ? "true" : "false";
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="flex items-center gap-1.5">
      <input type="hidden" name="groupName" value={groupName} />
      <input type="hidden" name="enabled" ref={enabledInputRef} defaultValue={enabled ? "false" : "true"} />
      <label htmlFor={id} className="cursor-pointer text-xs text-muted-foreground">
        Sincronizar reprodução
      </label>
      <Switch id={id} checked={checked} onCheckedChange={handleChange} disabled={pending} />
    </form>
  );
}

function GroupsPanel({
  outputs,
  syncedGroups,
  outputPlaylistById,
}: {
  outputs: BroadcastOutputRecord[];
  syncedGroups: string[];
  outputPlaylistById: Record<string, string | null>;
}) {
  const counts = new Map<string, number>();
  const playlistIdsByGroup = new Map<string, Set<string>>();
  for (const output of outputs) {
    if (!output.groupName) continue;
    counts.set(output.groupName, (counts.get(output.groupName) ?? 0) + 1);
    const pid = outputPlaylistById[output.id];
    if (pid) {
      if (!playlistIdsByGroup.has(output.groupName)) playlistIdsByGroup.set(output.groupName, new Set());
      playlistIdsByGroup.get(output.groupName)!.add(pid);
    }
  }
  const groups = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  if (groups.length === 0) return null;

  return (
    <div className="space-y-2 rounded-panel border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Grupos de telas</p>
      <p className="text-xs text-muted-foreground">
        Ações em lote e reprodução sincronizada. Sincronizar só funciona quando as telas do grupo tocam a{" "}
        <strong>mesma</strong> playlist (aponte uma tela pra playlist de outra na aba Conteúdo) — as TVs mostram o mesmo item,
        com ajuste de tempo (~1-2s de diferença, não é frame a frame).
      </p>
      <div className="space-y-2">
        {groups.map(([name, count]) => {
          const synced = syncedGroups.includes(name);
          const distinctPlaylists = playlistIdsByGroup.get(name)?.size ?? 0;
          return (
            <div key={name} className="space-y-1.5 border-t border-border/60 pt-2 first:border-t-0 first:pt-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-foreground">{name}</span>
                <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {count} {count === 1 ? "tela" : "telas"}
                </span>
                <div className="ml-auto">
                  <GroupSyncToggle groupName={name} enabled={synced} />
                </div>
              </div>
              {synced && distinctPlaylists > 1 && (
                <p className="rounded-panel border border-warning-border bg-warning-soft p-1.5 text-xs text-warning">
                  As telas deste grupo tocam playlists diferentes — a sincronização não vai casar. Aponte todas pra mesma
                  playlist na aba Conteúdo.
                </p>
              )}
              <div className="flex flex-wrap gap-1">
                <GroupBulkButton groupName={name} action="reload" label="Recarregar todas" />
                <GroupBulkButton groupName={name} action="offline-on" label="Pôr em espera" />
                <GroupBulkButton groupName={name} action="offline-off" label="Tirar da espera" />
                <GroupBulkButton groupName={name} action="ungroup" label="Desfazer grupo" />
              </div>
              <p className="text-xs text-muted-foreground">
                “Desfazer grupo” só tira o rótulo — as telas voltam a ser “Sem grupo”, nada é apagado.
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Horário de funcionamento — UMA janela (dias + início/fim). Fora dela, a tela entra em modo
// espera automático (get-output-state força offline). Vazio = sempre no ar. Reaproveita o
// vocabulário de dias/horário de shared/playlist-schedule.ts (bit 0 = domingo).
function OutputHoursSection({ output }: { output: BroadcastOutputRecord }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [days, setDays] = useState(output.activeDays ?? 0);
  const [startTime, setStartTime] = useState(
    output.activeStartMinute != null ? minutesToTimeLabel(output.activeStartMinute) : "",
  );
  const [endTime, setEndTime] = useState(output.activeEndMinute != null ? minutesToTimeLabel(output.activeEndMinute) : "");
  const [state, formAction, pending] = useActionState(setOutputHoursAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Horário salvo." });

  const configured = output.activeDays != null && output.activeStartMinute != null && output.activeEndMinute != null;

  function clearAndSave() {
    setDays(0);
    setStartTime("");
    setEndTime("");
    // Deixa o React aplicar antes do submit (os campos são controlados) — mesmo cuidado de outros
    // forms deste arquivo; um microtask basta aqui porque não há input escondido a sincronizar.
    queueMicrotask(() => formRef.current?.requestSubmit());
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Horário de funcionamento</p>
        <p className="text-xs text-muted-foreground">
          Fora deste horário a tela entra em espera sozinha. Deixe em branco pra ficar sempre no ar. Horário da instituição.
        </p>
      </div>
      <form ref={formRef} action={formAction} className="space-y-2">
        <input type="hidden" name="outputId" value={output.id} />
        <input type="hidden" name="days" value={days} />
        <input type="hidden" name="startTime" value={startTime} />
        <input type="hidden" name="endTime" value={endTime} />
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
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="time"
            value={startTime}
            onChange={(event) => setStartTime(event.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          />
          <span className="text-xs text-muted-foreground">até</span>
          <input
            type="time"
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            className="rounded-md border border-border bg-card px-2 py-1 text-xs text-foreground"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="sm" disabled={pending}>Salvar horário</Button>
          {configured && (
            <Button type="button" variant="ghost" size="sm" onClick={clearAndSave} disabled={pending}>
              Desligar (sempre no ar)
            </Button>
          )}
        </div>
      </form>
    </div>
  );
}

// Fallback de conteúdo — mensagem livre mostrada quando a playlist não tem vídeo tocável (no lugar
// da tela de espera genérica). A mídia de fallback (imagem/vídeo) já existe no schema/state; a UI
// pra escolhê-la fica pra um próximo passo — por ora, só a mensagem.
function OutputFallbackSection({ output }: { output: BroadcastOutputRecord }) {
  const [state, formAction, pending] = useActionState(setOutputFallbackAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Fallback salvo." });

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Conteúdo de fallback</p>
        <p className="text-xs text-muted-foreground">
          Mostrado quando a playlist fica sem vídeo pra tocar — em vez da tela de espera padrão.
        </p>
      </div>
      <form action={formAction} className="flex flex-wrap items-end gap-2">
        <input type="hidden" name="outputId" value={output.id} />
        <Input
          name="message"
          defaultValue={output.fallbackMessage ?? ""}
          placeholder="Ex: Programação em atualização"
          className="min-w-64 flex-1"
        />
        <Button type="submit" size="sm" disabled={pending}>Salvar</Button>
      </form>
    </div>
  );
}

// Agrupa os três liga/desliga de camada numa única lista — pedido explícito: "crie contexto:
// botões de abrir/fechar e ativar/desativar" (antes, agenda ficava solta no corpo do card e
// rodapé/ticker ficavam escondidos dentro de "Mais opções", sem nada explicando que os três são a
// mesma categoria de controle: o que aparece OU NÃO na tela). O ciclo de pausa da agenda aparece
// encaixado logo abaixo da própria linha "Agenda" (não solto no card) — só faz sentido com a
// agenda aberta, por isso continua condicional a drawerOpen.
function OutputLayersSection({ output }: { output: BroadcastOutputRecord }) {
  // Espelha o estado otimista do toggle "Agenda" só pra revelar/esconder o ciclo de pausa na hora
  // (LayerToggleRow reporta via onCheckedChange) — sem revalidatePath, o prop output.drawerOpen não
  // muda sozinho depois do clique. Revalidação estrutural remonta via `key` no OutputCard.
  const [drawerOpen, setDrawerOpen] = useState(output.drawerOpen);

  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Camadas exibidas na tela</p>
        <p className="text-xs text-muted-foreground">Além do vídeo, o que mais aparece nesta tela.</p>
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-panel border border-border">
        <LayerToggleRow
          output={output}
          action={setOutputDrawerAction}
          fieldName="drawerOpen"
          checked={output.drawerOpen}
          onCheckedChange={setDrawerOpen}
          iconOn={<PanelRightClose className="size-4" />}
          iconOff={<PanelRightOpen className="size-4" />}
          label="Agenda"
          description="Coluna lateral com os próximos eventos"
          tone="primary"
        />
        {drawerOpen && (
          <div className="bg-muted/20 p-3 pl-13">
            <SetOutputAgendaScheduleForm output={output} />
          </div>
        )}
        <LayerToggleRow
          output={output}
          action={setOutputFooterAction}
          fieldName="footerOpen"
          checked={output.footerOpen}
          iconOn={<PanelBottomClose className="size-4" />}
          iconOff={<PanelBottomOpen className="size-4" />}
          label="Rodapé"
          description="Logo, relógio, data e temperatura"
          tone="accent"
        />
        <LayerToggleRow
          output={output}
          action={setOutputTickerAction}
          fieldName="tickerEnabled"
          checked={output.tickerEnabled}
          iconOn={<ScrollText className="size-4" />}
          iconOff={<ScrollText className="size-4" />}
          label="Faixa de eventos"
          description="Próximos eventos rolando no rodapé"
          tone="warning"
        />
      </div>
    </div>
  );
}

// "Modo espera" (era "Tela offline", Fase 11) — chave mestra separada das camadas acima: liga uma
// tela de espera branded no lugar do conteúdo inteiro, não é "mais uma camada". "Espera" em vez de
// "offline" de propósito: é uma escolha do operador (pausar a exibição), não um defeito. Reaproveita
// LayerToggleRow (mesmo padrão otimista, sem revalidatePath — a TV troca via SSE).
function OutputStandbySection({ output }: { output: BroadcastOutputRecord }) {
  return (
    <div className="space-y-2">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Exibição</p>
        <p className="text-xs text-muted-foreground">
          No modo espera, a TV mostra uma tela de pausa com a marca do site — não o conteúdo.
        </p>
      </div>
      <div className="divide-y divide-border/60 overflow-hidden rounded-panel border border-border">
        <LayerToggleRow
          output={output}
          action={setOutputOfflineAction}
          fieldName="offline"
          checked={output.offline}
          iconOn={<PowerOff className="size-4" />}
          iconOff={<Power className="size-4" />}
          label="Modo espera"
          description="Pausa a exibição e mostra uma tela de pausa branded"
          tone="warning"
        />
        <LayerToggleRow
          output={output}
          action={setOutputFrozenAction}
          fieldName="frozen"
          checked={output.frozen}
          iconOn={<Snowflake className="size-4" />}
          iconOff={<Snowflake className="size-4" />}
          label="Congelar"
          description="Trava o item atual — a playlist para de avançar (sem ir pra espera)"
          tone="accent"
        />
      </div>
    </div>
  );
}

// PIN opcional de acesso à view pública — texto plano (ver set-output-pin/service.ts pro racional
// da decisão), null quando não configurado. Submeter vazio remove a proteção (setOutputPinAction
// trata "" como null); pedido explícito: "as views devem ser todas públicas [...] protegidas por
// PIN (pin cadastrado nas opções da view)".
function SetOutputPinForm({
  output,
  isProtected,
  onSaved,
}: {
  output: BroadcastOutputRecord;
  isProtected: boolean;
  onSaved: (pin: string | null) => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const pinInputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState(setOutputPinAction, outputToggleInitialState);
  // Sem revalidatePath — no sucesso, o painel colorido (OutputPinSection) reflete o novo estado a
  // partir do valor digitado, e o campo é limpo pra não parecer que o PIN continua na fila.
  useActionToast({
    pending,
    error: state.error,
    successMessage: "PIN atualizado.",
    onSuccess: () => {
      onSaved(pinInputRef.current?.value?.trim() || null);
      formRef.current?.reset();
    },
  });

  return (
    <form ref={formRef} action={formAction} className="flex flex-col items-start gap-2">
      <input type="hidden" name="outputId" value={output.id} />
      <Input
        ref={pinInputRef}
        name="pin"
        type="text"
        placeholder={isProtected ? "Trocar PIN..." : "Criar um PIN..."}
        className="w-32 bg-card"
      />
      <Button type="submit" size="sm" variant={isProtected ? "outline" : "default"} disabled={pending}>Salvar</Button>
    </form>
  );
}

// Sem form/onSubmit próprio — ConfirmDeleteButton já embute o formulário escondido + o
// AlertDialog de confirmação (pedido explícito: "a confirmação não deve ser pela confirmação
// nativa do navegador"). Ícone de lixeira no canto superior direito do painel — pedido explícito:
// "o botão Remover não está conversando [...] use o ícone de lixeira e posicione no canto superior
// direito" — mesmo lugar/estilo do botão de apagar tela no cabeçalho do card e do "Fechar preview"
// da capa, em vez de um botão de texto solto ao lado do campo.
function RemoveOutputPinButton({ outputId, onRemoved }: { outputId: string; onRemoved: () => void }) {
  return (
    <ConfirmDeleteButton
      action={setOutputPinAction}
      fields={{ outputId, pin: "" }}
      title="Remover PIN"
      description="Remover a proteção por PIN desta tela? Ela volta a ficar pública."
      confirmLabel="Remover"
      successMessage="PIN removido."
      icon={<Trash2 className="size-4" />}
      label="Remover PIN"
      variant="ghost"
      className="absolute top-2 right-2"
      onSuccess={onRemoved}
    />
  );
}

function DeleteOutputButton({ outputId, dedicatedPlaylistName }: { outputId: string; dedicatedPlaylistName: string | null }) {
  const description = dedicatedPlaylistName
    ? `Apagar esta tela? O link para de funcionar e a playlist dedicada "${dedicatedPlaylistName}" (com todos os itens) também é apagada.`
    : "Apagar esta tela? O link que ela usa para de funcionar.";
  return (
    <ConfirmDeleteButton
      action={deleteOutputAction}
      fields={{ outputId }}
      title="Apagar tela"
      description={description}
      successMessage="Saída apagada."
      icon={<Trash2 className="size-4" />}
      label="Apagar tela"
    />
  );
}

// "Duplicar tela" — cria "Cópia de X" com playlist dedicada, itens e ajustes de exibição copiados
// (sem token/PIN/responsáveis/vínculos/programação, ver features/outputs/duplicate-output). Ícone
// CopyPlus (não Copy) pra não ser confundido com "copiar o link".
function DuplicateOutputButton({ outputId }: { outputId: string }) {
  const [state, formAction, pending] = useActionState(duplicateOutputAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Tela duplicada — ela aparece na lista." });
  return (
    <form action={formAction}>
      <input type="hidden" name="outputId" value={outputId} />
      <Button type="submit" variant="ghost" size="icon" disabled={pending} aria-label="Duplicar tela" title="Duplicar tela">
        <CopyPlus className="size-4" />
      </Button>
    </form>
  );
}

// Copia o link da TV — versão ícone pro cabeçalho do detalhe (o botão grande verde fica no rodapé).
// Reusa a mesma lógica com fallback pra HTTP LAN de CopyOutputUrlButton.
function CopyOutputUrlIconButton({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const path = `/ext/broadcast/out/${token}`;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Copiar link da TV"
      title="Copiar link da TV"
      onClick={() => {
        const url = typeof window !== "undefined" ? `${window.location.origin}${path}` : path;
        void copyTextToClipboard(url).then((ok) => {
          if (ok) {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } else {
            window.prompt("Copie o link da TV:", url);
          }
        });
      }}
    >
      {copied ? <Check className="size-4 text-success" /> : <Link2 className="size-4" />}
    </Button>
  );
}

// Resumo "o que esta tela consome" — pedido explícito: "Rota mais clara: Hoje temos Agenda e
// Playlist que é consumida em Tela". Antes só dava pra ver o vínculo tela↔agenda do lado da
// AGENDA (AgendaOutputsForm em agenda-section.tsx); olhando pra uma tela não havia como saber
// quais agendas a alimentam. playlistName vem do <Select> ao lado (currentPlaylistId já resolvido
// por output); agendaNames vem de agendaNamesByOutputId (invertido a partir do vínculo
// agenda→saída em page.tsx). O badge carrega o sinal de cor (playlist é o que decide se a tela
// está "Pronta" — ver status.ts); a agenda é opcional, então só aparece como chip neutro, e só
// quando existe (pedido: "indicações luminosas e coloridas" + "não quero informação jogada na
// tela" — cada elemento aqui carrega um sinal, nenhum é só decoração).
// connectedIps — pedido explícito: "vamos criar um sistema em que mostra também a quantidade de
// TVs conectadas", depois "quero poder saber qual é a TV que conectou. Pode ser com o dado de IP
// local" (ver getConnectedOutputIps, runtime/output-bus.ts). Continua visível mesmo com o card
// fechado (é a mesma linha de OutputStatusRow, dentro do CardHeader — nunca escondida pelo
// colapso), junto dos badges de playlist/agenda: verde quando pelo menos uma TV está com a tela
// aberta agora, cinza quando nenhuma. A contagem no badge é a de CONEXÕES (cada aba/TV aberta
// conta uma vez, mesmo que duas dividam o mesmo IP); a lista de IPs logo abaixo já vem sem
// duplicata — é "de onde", não "quantas".
// Badge do próprio "N TVs conectadas" vira o gatilho do dropdown — pedido explícito: "lista de
// IPs deve aparecer com um dropdown do badge. Mostrar apenas o IP" (antes a lista ficava sempre
// visível numa linha embaixo dos badges). DropdownMenuTrigger sem asChild já renderiza um <button>
// de verdade em volta do que for passado como children — não precisa de wrapper próprio pro
// StatusBadge (que é só um <span>) virar clicável. Sem conteúdo pra mostrar (nenhuma TV
// conectada), o badge fica só informativo, sem virar gatilho de menu vazio.
function ConnectedTvsBadge({ connectedIps }: { connectedIps: string[] }) {
  const uniqueIps = [...new Set(connectedIps)].sort();
  return (
    <ListDropdownBadge
      tone={connectedIps.length > 0 ? "success" : "muted"}
      label={
        <>
          <Tv className="size-3" aria-hidden="true" />
          {connectedIps.length} {connectedIps.length === 1 ? "TV conectada" : "TVs conectadas"}
        </>
      }
      items={uniqueIps}
      itemClassName="font-mono text-foreground"
    />
  );
}

// "no ar há 2 h" a partir dos segundos de uptime do beacon.
function formatUptime(seconds: number): string {
  if (seconds < 60) return "menos de 1 min";
  if (seconds < 3600) return `${Math.round(seconds / 60)} min`;
  if (seconds < 86400) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

function OutputStatusRow({
  playlistName,
  agendaNames,
  connectedIps,
  telemetry,
}: {
  playlistName: string | null;
  agendaNames: string[];
  connectedIps: string[];
  telemetry: OutputBeaconSummary[];
}) {
  const status = outputItemStatus(Boolean(playlistName));
  const primary = telemetry[0];

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-2">
        <StatusBadge tone={status.tone}>{playlistName ? `Playlist: ${playlistName}` : status.label}</StatusBadge>
        {agendaNames.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            {agendaNames.length} {agendaNames.length === 1 ? "agenda" : "agendas"}
          </span>
        )}
        <ConnectedTvsBadge connectedIps={connectedIps} />
      </div>
      {primary && (
        <p className="text-xs text-muted-foreground">
          {primary.viewport.replace("x", "×")} · {primary.browser} · no ar há {formatUptime(primary.uptimeSeconds)}
          {primary.nowPlaying ? ` · tocando ${primary.nowPlaying}` : ""}
          {telemetry.length > 1 ? ` · +${telemetry.length - 1}` : ""}
        </p>
      )}
    </div>
  );
}

// Painel sempre visível (não mais atrás de um disclosure) — pedido explícito: "faça algo mais
// chamativo, colorido, que mostre a importância de colocar um PIN. Use ícone grande" — esconder
// atrás de um "Mais opções" ia contra o pedido de dar destaque. A cor conta a história sozinha,
// mesmo racional de status.ts: verde quando protegida, âmbar quando qualquer um com o link abre a
// tela — o mesmo sinal "precisa de atenção" já usado nos badges de status, aqui em escala de card
// inteiro em vez de badge pequeno.
function OutputPinSection({ output, pinBlocked = false }: { output: BroadcastOutputRecord; pinBlocked?: boolean }) {
  // Estado otimista do PIN — sem revalidatePath, o painel reflete criar/trocar/remover na hora
  // (SetOutputPinForm.onSaved / RemoveOutputPinButton.onRemoved). Revalidação estrutural remonta
  // via `key` no OutputCard.
  const [pin, setPin] = useState(output.pin);
  const isProtected = Boolean(pin);

  return (
    <div
      className={`relative flex items-start gap-3 rounded-panel border p-3 ${
        isProtected ? "border-success-border bg-success-soft" : "border-warning-border bg-warning-soft"
      }`}
    >
      {isProtected && <RemoveOutputPinButton outputId={output.id} onRemoved={() => setPin(null)} />}
      {isProtected ? (
        <ShieldCheck className="size-8 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <ShieldAlert className="size-8 shrink-0 text-warning" aria-hidden="true" />
      )}
      <div className="min-w-0 flex-1 space-y-2 pr-8">
        <div>
          <p className={`text-sm font-semibold ${isProtected ? "text-success" : "text-warning"}`}>
            {isProtected ? "Protegida com PIN" : "Tela sem proteção"}
          </p>
          <p className="text-xs text-muted-foreground">
            {isProtected
              ? "Só quem souber o PIN consegue abrir esta tela no navegador."
              : "Qualquer pessoa com o link abre esta tela. Considere proteger com um PIN."}
          </p>
        </div>
        {pinBlocked && (
          <p className="text-xs font-medium text-warning">
            Há tentativas de PIN bloqueadas nesta tela agora — se for uma TV legítima presa no limite, libere abaixo.
          </p>
        )}
        <SetOutputPinForm output={output} isProtected={isProtected} onSaved={setPin} />
        {isProtected && <ResetOutputPinAttemptsButton outputId={output.id} />}
      </div>
    </div>
  );
}

// "Liberar tentativas de PIN" — zera o limitador de brute force (runtime/pin-attempts.ts) desta
// tela, todos os IPs de uma vez. Sempre visível quando a tela tem PIN (o contador é em memória, o
// admin não tem como saber daqui se há um bloqueio ativo agora sem um poll dedicado — e o custo de
// clicar sem bloqueio nenhum é zero). Não é destrutivo, então sem AlertDialog: um submit direto.
function ResetOutputPinAttemptsButton({ outputId }: { outputId: string }) {
  const [state, formAction, pending] = useActionState(resetOutputPinAttemptsAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Tentativas de PIN liberadas." });

  return (
    <form action={formAction}>
      <input type="hidden" name="outputId" value={outputId} />
      <Button type="submit" size="sm" variant="ghost" disabled={pending} className="text-success">
        Liberar tentativas de PIN
      </Button>
    </form>
  );
}

// "Recarregar a TV agora" — publica o evento SSE "reload" (a TV faz location.reload() sozinha, ver
// output-canvas.tsx). Pra quando uma TV bugou e ninguém quer ir lá fisicamente. Não é destrutivo,
// submit direto sem AlertDialog. Gate no handler (broadcast.manage OU outputs.manage + atribuição).
function ReloadOutputButton({ outputId }: { outputId: string }) {
  const [state, formAction, pending] = useActionState(reloadOutputAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Sinal de recarregar enviado à TV." });

  return (
    <form action={formAction}>
      <input type="hidden" name="outputId" value={outputId} />
      <Button type="submit" size="sm" variant="outline" disabled={pending} className="w-full sm:w-auto">
        <RotateCw className="size-4" />
        Recarregar a TV agora
      </Button>
    </form>
  );
}

// Um poll só pra todas as telas juntas (não um por card) — pedido explícito: "mostra também a
// quantidade de TVs conectadas" + "quero poder saber qual é a TV que conectou". A leitura em si é
// só um Map lido em memória (ver getConnectedOutputIps, runtime/output-bus.ts), então um intervalo
// de 5s é reação rápida o bastante sem virar tráfego desnecessário; parado quando a aba não está
// visível (evita poll com o admin em segundo plano).
const CONNECTED_IPS_POLL_MS = 5000;

type OutputLiveStatus = {
  ipsByToken: Record<string, string[]>;
  blockedTokens: Set<string>;
  telemetryByToken: Record<string, OutputBeaconSummary[]>;
};

function useOutputLiveStatus(): OutputLiveStatus {
  const [status, setStatus] = useState<OutputLiveStatus>({ ipsByToken: {}, blockedTokens: new Set(), telemetryByToken: {} });

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      if (document.visibilityState !== "visible") return;
      const [ipsByToken, blocked, telemetryByToken] = await Promise.all([
        getConnectedOutputIpsAction(),
        getOutputPinBlocksAction(),
        getOutputTelemetryAction(),
      ]);
      if (!cancelled) setStatus({ ipsByToken, blockedTokens: new Set(blocked), telemetryByToken });
    }

    poll();
    const interval = setInterval(poll, CONNECTED_IPS_POLL_MS);
    document.addEventListener("visibilitychange", poll);
    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", poll);
    };
  }, []);

  return status;
}


// ---------------------------------------------------------------------------------------------------
// Layout master-detail (v1.7): lista de telas a esquerda, detalhe da selecionada a direita com 4
// abas (Conteudo / Layout / Disponibilidade / Acesso). Substitui o grid de cards gigantes - cada
// card empilhava ~10 secoes de config abertas de uma vez. Ver components/admin/master-detail.tsx.
// ---------------------------------------------------------------------------------------------------

// Modelo de playlist da tela: toda tela nasce com uma playlist propria (ownerOutputId === tela).
// Pode passar a tocar a playlist de OUTRA tela (recepcao + catracas mostrando o mesmo) - nesse
// caso o editor de itens fica na tela dona, e aqui so um resumo + atalho.
function buildPlaylistOptions(
  output: BroadcastOutputRecord,
  ownPlaylist: BroadcastPlaylistRecord | null,
  outputs: BroadcastOutputRecord[],
  playlists: BroadcastPlaylistRecord[],
): BroadcastPlaylistRecord[] {
  const options: BroadcastPlaylistRecord[] = [];
  if (ownPlaylist) options.push({ ...ownPlaylist, name: "Playlist propria desta tela" });

  const ownerByOutputId = new Map(playlists.filter((p) => p.ownerOutputId).map((p) => [p.ownerOutputId as string, p]));
  for (const other of outputs) {
    if (other.id === output.id) continue;
    const otherOwned = ownerByOutputId.get(other.id);
    if (otherOwned) options.push({ ...otherOwned, name: `Playlist da tela "${other.name}"` });
  }

  for (const shared of playlists) {
    if (!shared.ownerOutputId) options.push({ ...shared, name: `Compartilhada: ${shared.name}` });
  }
  return options;
}

function OutputContentTab({
  output,
  ownPlaylist,
  currentPlaylistId,
  playlists,
  outputs,
  outputPlaylistById,
  itemsByPlaylist,
  itemMediaById,
  agendaEventById,
  agendas,
  agendaEvents,
  scheduleSlots,
  canManageAll,
}: {
  output: BroadcastOutputRecord;
  ownPlaylist: BroadcastPlaylistRecord | null;
  currentPlaylistId: string | null;
  playlists: BroadcastPlaylistRecord[];
  outputs: BroadcastOutputRecord[];
  outputPlaylistById: Record<string, string | null>;
  itemsByPlaylist: Record<string, BroadcastPlaylistItemRecord[]>;
  itemMediaById: Record<string, PickableMedia | null>;
  agendaEventById: Record<string, BroadcastAgendaEventRecord>;
  agendas: BroadcastAgendaRecord[];
  agendaEvents: BroadcastAgendaEventRecord[];
  scheduleSlots: BroadcastPlaylistScheduleSlot[];
  canManageAll: boolean;
}) {
  const options = buildPlaylistOptions(output, ownPlaylist, outputs, playlists);
  const playingOwn = ownPlaylist != null && currentPlaylistId === ownPlaylist.id;
  const currentPlaylist = playlists.find((playlist) => playlist.id === currentPlaylistId) ?? null;

  // Outras telas que tocam ESTA playlist propria agora (aviso "alterar aqui muda nelas tambem").
  const alsoPlayedBy = playingOwn
    ? outputs
        .filter((other) => other.id !== output.id && outputPlaylistById[other.id] === ownPlaylist!.id)
        .map((other) => other.name)
    : [];

  const ownerOutput =
    currentPlaylist?.ownerOutputId && currentPlaylist.ownerOutputId !== output.id
      ? (outputs.find((other) => other.id === currentPlaylist.ownerOutputId) ?? null)
      : null;
  const currentItemCount = currentPlaylist ? (itemsByPlaylist[currentPlaylist.id] ?? []).length : 0;

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Playlist</p>
        <p className="text-xs text-muted-foreground">
          Cada tela tem a propria playlist. Aponte para a de outra tela quando duas telas devem mostrar o mesmo.
        </p>
        <SetOutputPlaylistForm output={output} playlists={options} currentPlaylistId={currentPlaylistId} />
      </div>

      {playingOwn && ownPlaylist ? (
        <>
          {alsoPlayedBy.length > 0 && (
            <p className="rounded-panel border border-warning-border bg-warning-soft p-2 text-xs text-warning">
              Tambem toca em: <span className="font-medium">{alsoPlayedBy.join(", ")}</span>. Alterar os itens aqui muda em
              todas.
            </p>
          )}
          <SortablePlaylistItems
            playlistId={ownPlaylist.id}
            items={itemsByPlaylist[ownPlaylist.id] ?? []}
            itemMediaById={itemMediaById}
            agendaEventById={agendaEventById}
          />
          <PlaylistAddSection playlist={ownPlaylist} agendas={agendas} agendaEvents={agendaEvents} />
        </>
      ) : (
        <div className="space-y-1.5 rounded-panel border border-border bg-muted/20 p-3 text-xs text-muted-foreground">
          <p>
            Esta tela toca{" "}
            <span className="font-medium text-foreground">{currentPlaylist?.name ?? "nenhuma playlist"}</span>
            {currentPlaylist ? ` (${currentItemCount} ${currentItemCount === 1 ? "item" : "itens"})` : ""}.
          </p>
          {ownerOutput && (
            <a
              href={`?aba=outputs&tela=${ownerOutput.id}&ver=conteudo`}
              className="inline-flex items-center gap-1 font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
            >
              Editar os itens em Telas &rsaquo; {ownerOutput.name}
              <ExternalLink className="size-3" aria-hidden="true" />
            </a>
          )}
        </div>
      )}

      {canManageAll && (
        <div className="border-t border-border/60 pt-4">
          <OutputScheduleSection output={output} playlists={playlists} slots={scheduleSlots} />
        </div>
      )}
    </div>
  );
}

function OutputAvailabilityTab({ output, canManageAll }: { output: BroadcastOutputRecord; canManageAll: boolean }) {
  return (
    <div className="space-y-4">
      <OutputStandbySection output={output} />
      {canManageAll && (
        <div className="border-t border-border/60 pt-4">
          <OutputHoursSection output={output} />
        </div>
      )}
      {canManageAll && (
        <div className="border-t border-border/60 pt-4">
          <OutputFallbackSection output={output} />
        </div>
      )}
    </div>
  );
}

function OutputAccessTab({
  output,
  pinBlocked,
  canManageAll,
}: {
  output: BroadcastOutputRecord;
  pinBlocked: boolean;
  canManageAll: boolean;
}) {
  return (
    <div className="space-y-4">
      <OutputPinSection output={output} pinBlocked={pinBlocked} />
      <div className="space-y-2 border-t border-border/60 pt-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Link da TV</p>
        <p className="text-xs text-muted-foreground">Abra este link no navegador da TV. O QR code evita digitar no controle.</p>
        <CopyOutputUrlButton token={output.token} />
        <OutputQrToggle token={output.token} />
        {canManageAll && (
          <ConfirmDeleteButton
            action={rotateOutputTokenAction}
            fields={{ outputId: output.id }}
            title="Gerar novo link"
            description="Gerar um link novo para esta tela? O link atual para de funcionar na hora - voce vai precisar reabrir o link novo em cada TV que usava o antigo."
            confirmLabel="Gerar novo link"
            successMessage="Link novo gerado."
            icon={<RotateCw className="size-4" />}
            label="Gerar novo link"
            variant="ghost"
            className="w-full"
          />
        )}
      </div>
    </div>
  );
}

function OutputDetail({
  output,
  playlists,
  outputs,
  outputPlaylistById,
  itemsByPlaylist,
  itemMediaById,
  agendaEventById,
  agendas,
  agendaEvents,
  agendaNames,
  connectedIps,
  telemetry,
  pinBlocked,
  scheduleSlots,
  allGroups,
  syncedGroups,
  canManageAll,
}: {
  output: BroadcastOutputRecord;
  playlists: BroadcastPlaylistRecord[];
  outputs: BroadcastOutputRecord[];
  outputPlaylistById: Record<string, string | null>;
  itemsByPlaylist: Record<string, BroadcastPlaylistItemRecord[]>;
  itemMediaById: Record<string, PickableMedia | null>;
  agendaEventById: Record<string, BroadcastAgendaEventRecord>;
  agendas: BroadcastAgendaRecord[];
  agendaEvents: BroadcastAgendaEventRecord[];
  agendaNames: string[];
  connectedIps: string[];
  telemetry: OutputBeaconSummary[];
  pinBlocked: boolean;
  scheduleSlots: BroadcastPlaylistScheduleSlot[];
  allGroups: string[];
  syncedGroups: string[];
  canManageAll: boolean;
}) {
  const ownPlaylist = playlists.find((playlist) => playlist.ownerOutputId === output.id) ?? null;
  const currentPlaylistId = outputPlaylistById[output.id] ?? null;
  const [tab, setTab] = useUrlParam("ver", "conteudo");
  const playlistName = playlists.find((playlist) => playlist.id === currentPlaylistId)?.name ?? null;
  const groupSynced = Boolean(output.groupName && syncedGroups.includes(output.groupName));

  return (
    <Card
      className="gap-3"
      // Faixa lateral com a cor do card — box-shadow inset (não border) pra aparecer sempre e não
      // empurrar o layout. O Card usa ring, não border, então border-l-* não renderiza estilo.
      style={output.cardColor ? { boxShadow: `inset 4px 0 0 0 ${output.cardColor}` } : undefined}
    >
      <OutputCoverPreview token={output.token} />
      <CardHeader>
        <div className="col-start-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {canManageAll && <OutputColorControl output={output} />}
          <CardTitle className="min-w-0 truncate">{output.name}</CardTitle>
          {canManageAll && <OutputGroupControl output={output} allGroups={allGroups} synced={groupSynced} />}
        </div>
        <CardAction className="flex items-center gap-0.5">
          <CopyOutputUrlIconButton token={output.token} />
          {canManageAll && <DuplicateOutputButton outputId={output.id} />}
          {canManageAll && <DeleteOutputButton outputId={output.id} dedicatedPlaylistName={ownPlaylist?.name ?? null} />}
        </CardAction>
        <div className="col-start-1 mt-1">
          <OutputStatusRow
            playlistName={playlistName}
            agendaNames={agendaNames}
            connectedIps={connectedIps}
            telemetry={telemetry}
          />
        </div>
      </CardHeader>
      <CardContent>
        <Tabs value={tab ?? "conteudo"} onValueChange={setTab}>
          <TabsList className="w-full">
            <TabsTrigger value="conteudo" className="flex-1">
              <ListVideo className="size-4" /> Conteudo
            </TabsTrigger>
            <TabsTrigger value="layout" className="flex-1">
              <Layers className="size-4" /> Layout
            </TabsTrigger>
            <TabsTrigger value="disponibilidade" className="flex-1">
              <Clock className="size-4" /> Disponibilidade
            </TabsTrigger>
            <TabsTrigger value="acesso" className="flex-1">
              <KeyRound className="size-4" /> Acesso
            </TabsTrigger>
          </TabsList>
          <TabsContent value="conteudo" className="pt-4">
            <OutputContentTab
              output={output}
              ownPlaylist={ownPlaylist}
              currentPlaylistId={currentPlaylistId}
              playlists={playlists}
              outputs={outputs}
              outputPlaylistById={outputPlaylistById}
              itemsByPlaylist={itemsByPlaylist}
              itemMediaById={itemMediaById}
              agendaEventById={agendaEventById}
              agendas={agendas}
              agendaEvents={agendaEvents}
              scheduleSlots={scheduleSlots}
              canManageAll={canManageAll}
            />
          </TabsContent>
          <TabsContent value="layout" className="pt-4">
            <OutputLayersSection output={output} />
          </TabsContent>
          <TabsContent value="disponibilidade" className="pt-4">
            <OutputAvailabilityTab output={output} canManageAll={canManageAll} />
          </TabsContent>
          <TabsContent value="acesso" className="pt-4">
            <OutputAccessTab output={output} pinBlocked={pinBlocked} canManageAll={canManageAll} />
          </TabsContent>
        </Tabs>
      </CardContent>
      <CardFooter className="border-t-primary/20 bg-primary/8">
        {/* Sempre visível (independe da aba aberta) — copiar o link da TV é a ação mais comum do
            card inteiro. "Recarregar a TV" fica ao lado por ser a outra ação rápida do dia a dia. */}
        <div className="w-full space-y-2">
          <CopyOutputUrlButton token={output.token} />
          <ReloadOutputButton outputId={output.id} />
        </div>
      </CardFooter>
    </Card>
  );
}

function CreateOutputDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" className="w-full">
          <Plus className="size-4" /> Nova tela
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Nova tela</DialogTitle>
          <DialogDescription>A playlist dela e criada junto. Tudo o mais se ajusta depois.</DialogDescription>
        </DialogHeader>
        <CreateOutputForm />
      </DialogContent>
    </Dialog>
  );
}

function GroupsDialog({ outputs, syncedGroups, outputPlaylistById }: { outputs: BroadcastOutputRecord[]; syncedGroups: string[]; outputPlaylistById: Record<string, string | null> }) {
  const hasGroups = outputs.some((output) => output.groupName);
  if (!hasGroups) return null;
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="w-full">
          Grupos
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Grupos de telas</DialogTitle>
          <DialogDescription>Ações em lote e reprodução sincronizada por grupo.</DialogDescription>
        </DialogHeader>
        <GroupsPanel outputs={outputs} syncedGroups={syncedGroups} outputPlaylistById={outputPlaylistById} />
      </DialogContent>
    </Dialog>
  );
}

export function OutputsSection({
  outputs,
  playlists,
  outputPlaylistById,
  itemsByPlaylist = {},
  itemMediaById = {},
  agendas = [],
  agendaEvents = [],
  schedulesByOutputId = {},
  syncedGroups = [],
  canManageAll = true,
  agendaNamesByOutputId = {},
}: {
  outputs: BroadcastOutputRecord[];
  playlists: BroadcastPlaylistRecord[];
  outputPlaylistById: Record<string, string | null>;
  itemsByPlaylist?: Record<string, BroadcastPlaylistItemRecord[]>;
  itemMediaById?: Record<string, PickableMedia | null>;
  agendas?: BroadcastAgendaRecord[];
  agendaEvents?: BroadcastAgendaEventRecord[];
  schedulesByOutputId?: Record<string, BroadcastPlaylistScheduleSlot[]>;
  syncedGroups?: string[];
  // false pra um ator sem broadcast.manage (so broadcast.outputs.manage - "responsavel" por
  // telas especificas, ver page.tsx) - esconde criar/apagar tela + grupos + programacao.
  canManageAll?: boolean;
  agendaNamesByOutputId?: Record<string, string[]>;
}) {
  const { ipsByToken: connectedIpsByToken, blockedTokens, telemetryByToken } = useOutputLiveStatus();
  const allGroups = [...new Set(outputs.map((output) => output.groupName).filter((g): g is string => Boolean(g)))].sort();
  const agendaEventById = Object.fromEntries(agendaEvents.map((event) => [event.id, event]));

  const entries: MasterDetailEntry[] = outputs.map((output) => {
    const hasPlaylist = Boolean(outputPlaylistById[output.id]);
    const ips = connectedIpsByToken[output.token] ?? [];
    return {
      id: output.id,
      name: output.name,
      status: outputItemStatus(hasPlaylist),
      groupKey: output.groupName,
      groupLabel: output.groupName,
      accentColor: output.cardColor,
      attention: !hasPlaylist || output.offline,
      badge:
        ips.length > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-success-border bg-success-soft px-1.5 py-0.5 text-xs font-medium text-success">
            <Tv className="size-3" aria-hidden="true" />
            {ips.length}
          </span>
        ) : undefined,
    };
  });

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Novo na hora de ligar uma TV?{" "}
        <a
          href="/ext/broadcast/setup"
          target="_blank"
          rel="noopener noreferrer"
          className="font-medium text-foreground underline decoration-dotted underline-offset-2 hover:text-primary"
        >
          Abrir o guia de configuracao
        </a>{" "}
        (da pra imprimir).
      </p>
      <MasterDetail
        paramKey="tela"
        entries={entries}
        searchPlaceholder="Buscar tela..."
        toolbar={
          canManageAll ? (
            <div className="flex flex-col gap-2">
              <CreateOutputDialog />
              <GroupsDialog outputs={outputs} syncedGroups={syncedGroups} outputPlaylistById={outputPlaylistById} />
              <VideosFolderHealthBadge />
            </div>
          ) : undefined
        }
        emptyState={
          <p className="text-sm text-muted-foreground">
            {canManageAll ? "Nenhuma tela cadastrada ainda." : "Nenhuma tela foi atribuida a voce ainda."}
          </p>
        }
        renderDetail={(id) => {
          const output = outputs.find((entry) => entry.id === id);
          if (!output) return null;
          return (
            <OutputDetail
              key={`${output.id}:${output.updatedAt.getTime()}`}
              output={output}
              playlists={playlists}
              outputs={outputs}
              outputPlaylistById={outputPlaylistById}
              itemsByPlaylist={itemsByPlaylist}
              itemMediaById={itemMediaById}
              agendaEventById={agendaEventById}
              agendas={agendas}
              agendaEvents={agendaEvents}
              agendaNames={agendaNamesByOutputId[output.id] ?? []}
              connectedIps={connectedIpsByToken[output.token] ?? []}
              telemetry={telemetryByToken[output.token] ?? []}
              pinBlocked={blockedTokens.has(output.token)}
              scheduleSlots={schedulesByOutputId[output.id] ?? []}
              allGroups={allGroups}
              syncedGroups={syncedGroups}
              canManageAll={canManageAll}
            />
          );
        }}
      />
    </div>
  );
}
