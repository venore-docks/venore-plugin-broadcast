"use client";

import { useActionState, useMemo, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode } from "react";
import { CalendarPlus, ChevronDown, ChevronUp, GripVertical, MapPin, Pencil, Trash2, Tv } from "lucide-react";
import { Button } from "@venore/plugin-sdk/ui";
import { Card, CardAction, CardContent, CardFooter, CardHeader, CardTitle } from "@venore/plugin-sdk/ui";
import { Input } from "@venore/plugin-sdk/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@venore/plugin-sdk/ui";
import { Switch } from "@venore/plugin-sdk/ui";
import { Textarea } from "@venore/plugin-sdk/ui";
import { MediaPickerField } from "@venore/plugin-sdk/ui";
import type { PickableMedia } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
// Importa direto de contracts/, nunca do barrel (@/plugins/broadcast) — mesmo racional de
// outputs-section.tsx.
import type {
  BroadcastAgendaEventDate,
  BroadcastAgendaEventRecord,
  BroadcastAgendaRecord,
  BroadcastOutputRecord,
} from "../../contracts/types";
// Import direto do módulo compartilhado (não do barrel @/plugins/broadcast) — mesma regra dos
// tipos acima: client component nunca pode arrastar o barrel de server (Drizzle/pg) pro bundle.
import { isEventHappeningNow, resolveEventEndDate, resolveEventOccurrenceDate } from "../../shared/weekly-recurrence";
import { STATUS_BORDER_CLASSNAME, StatusBadge } from "./status-dot";
import { agendaItemStatus } from "./status";
import { ConfirmDeleteButton } from "./confirm-delete-form";
import { SortableList, type SortableRowRenderProps } from "./sortable-list";
import {
  createAgendaAction,
  createAgendaEventAction,
  importAgendaCsvAction,
  deleteAgendaAction,
  deleteAgendaEventAction,
  reorderAgendasAction,
  setAgendaOutputsAction,
  updateAgendaAction,
  updateAgendaEventAction,
  type BroadcastActionState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };
const DEFAULT_AGENDA_COLOR = "#0f0f0f";

// Campos empilhados verticalmente (label em cima, campo largura cheia) em todos os formulários
// deste arquivo — mesmo racional já aplicado em playlists-section.tsx: um formulário com vários
// campos lado a lado (flex-wrap) quebra em containers estreitos e fica difícil de escanear;
// empilhado nunca depende da largura disponível pra ficar legível. Feedback direto: "a UX da
// admin/broadcast Agenda precisa ser alterada, está muito complexa e pouco intuitiva".
function CreateAgendaForm() {
  const [state, formAction, pending] = useActionState(createAgendaAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Agenda criada." });

  return (
    <form action={formAction} className="space-y-3 rounded-panel border border-border bg-card p-3">
      <p className="text-sm font-medium text-foreground">Nova agenda</p>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="agenda-name">Nome</label>
        <Input id="agenda-name" name="name" placeholder="Semanal, Mensal, Faculdade..." required className="w-full sm:max-w-sm" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="agenda-duration">Segundos na tela antes de trocar</label>
        <Input id="agenda-duration" name="displaySeconds" type="number" placeholder="20" className="w-32" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor="agenda-color">Cor de fundo na TV</label>
        <input
          id="agenda-color"
          name="backgroundColor"
          type="color"
          defaultValue={DEFAULT_AGENDA_COLOR}
          className="h-9 w-16 cursor-pointer rounded-md border border-border"
        />
      </div>
      <MediaPickerField name="logoMediaAssetId" label="Logo da agenda (opcional, senão usa a logo da plataforma)" />
      <Button type="submit" disabled={pending}>Nova agenda</Button>
    </form>
  );
}

function EditAgendaForm({ agenda, logoMedia }: { agenda: BroadcastAgendaRecord; logoMedia: PickableMedia | null }) {
  const [state, formAction, pending] = useActionState(updateAgendaAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Agenda atualizada." });

  return (
    <form
      // key muda quando o registro é salvo (updatedAt novo) — força remontar o form inteiro, senão
      // os <input defaultValue=...> não controlados (cor, nome, duração) continuam mostrando o
      // valor antigo depois do save: React só aplica defaultValue no mount, nunca em re-render de
      // uma instância já montada. Sem isso o operador salva, o dado grava certinho no banco, mas o
      // próprio formulário parece não ter mudado nada — achado real reportado pelo usuário.
      key={`${agenda.id}-${agenda.updatedAt.getTime()}`}
      action={formAction}
      className="space-y-3"
    >
      <input type="hidden" name="agendaId" value={agenda.id} />
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${agenda.id}-edit-name`}>Nome</label>
        <Input id={`${agenda.id}-edit-name`} name="name" defaultValue={agenda.name} required className="w-full" />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${agenda.id}-edit-duration`}>Segundos na tela</label>
        <Input
          id={`${agenda.id}-edit-duration`}
          name="displaySeconds"
          type="number"
          defaultValue={agenda.displaySeconds}
          className="w-32"
        />
      </div>
      <div className="space-y-1">
        <label className="text-xs font-medium text-muted-foreground" htmlFor={`${agenda.id}-edit-color`}>Cor de fundo</label>
        <input
          id={`${agenda.id}-edit-color`}
          name="backgroundColor"
          type="color"
          defaultValue={agenda.backgroundColor ?? DEFAULT_AGENDA_COLOR}
          className="h-9 w-16 cursor-pointer rounded-md border border-border"
        />
      </div>
      <MediaPickerField name="logoMediaAssetId" label="Logo da agenda" initialMedia={logoMedia} />
      <Button type="submit" size="sm" disabled={pending}>Salvar</Button>
    </form>
  );
}

// Importa eventos de um CSV colado (título, início, fim, local, descrição). Eventos avulsos —
// recorrência e datas extras continuam no formulário normal.
function ImportAgendaCsvForm({ agendaId }: { agendaId: string }) {
  const [state, formAction, pending] = useActionState(importAgendaCsvAction, { error: null, summary: null });
  useActionToast({ pending, error: state.error, successMessage: state.summary ? "Importação concluída." : undefined });

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="agendaId" value={agendaId} />
      <p className="text-xs text-muted-foreground">
        Colunas (cabeçalho): <span className="font-mono">titulo, inicio, fim, local, descricao</span>. Datas como{" "}
        <span className="font-mono">2026-03-15 19:30</span>.
      </p>
      <Textarea
        name="csv"
        rows={5}
        placeholder={"titulo,inicio,fim,local\nCulto de domingo,2026-03-15 19:00,2026-03-15 20:30,Templo"}
        className="w-full font-mono text-xs"
      />
      <Button type="submit" size="sm" disabled={pending}>Importar CSV</Button>
      {state.summary && (
        <pre className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-card p-2 text-xs text-muted-foreground">
          {state.summary}
        </pre>
      )}
    </form>
  );
}

function DeleteAgendaButton({ agendaId, linkedScreenNames }: { agendaId: string; linkedScreenNames: string[] }) {
  const description =
    linkedScreenNames.length > 0
      ? `Apagar esta agenda e todos os seus eventos? ${linkedScreenNames.length === 1 ? "A tela" : "As telas"} ${linkedScreenNames.join(
          ", ",
        )} ${linkedScreenNames.length === 1 ? "deixa" : "deixam"} de mostrar esses eventos.`
      : "Apagar esta agenda e todos os seus eventos? Ela não está vinculada a nenhuma tela.";
  return (
    <ConfirmDeleteButton
      action={deleteAgendaAction}
      fields={{ agendaId }}
      title="Apagar agenda"
      description={description}
      successMessage="Agenda removida."
      icon={<Trash2 className="size-4" />}
      label="Remover agenda"
    />
  );
}

// Vínculo agenda↔saída — checkboxes, todas as saídas resubmetidas via JSON (mesmo padrão de
// "reenviar o conjunto inteiro" das outras features deste arquivo). Nenhuma marcada = a agenda
// não aparece em NENHUMA saída (modelo opt-in, ver comentário no schema broadcastOutputAgendas) —
// pedido real: "só deve aparecer QUANDO estiver vinculada a uma tela".
function AgendaOutputsForm({
  agendaId,
  outputs,
  selectedOutputIds,
}: {
  agendaId: string;
  outputs: BroadcastOutputRecord[];
  selectedOutputIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedOutputIds));
  const [state, formAction, pending] = useActionState(setAgendaOutputsAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Telas atualizadas." });

  if (outputs.length === 0) {
    return <p className="text-xs text-muted-foreground">Nenhuma tela cadastrada ainda.</p>;
  }

  function toggle(outputId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(outputId)) next.delete(outputId);
      else next.add(outputId);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-2">
      <input type="hidden" name="agendaId" value={agendaId} />
      <input type="hidden" name="outputIds" value={JSON.stringify([...selected])} />
      <p className="text-xs text-muted-foreground">Nenhuma marcada = não aparece em nenhuma tela.</p>
      <div className="flex flex-col gap-1.5">
        {outputs.map((output) => (
          <label key={output.id} className="flex items-center gap-1.5 text-sm text-foreground">
            <input
              type="checkbox"
              checked={selected.has(output.id)}
              onChange={() => toggle(output.id)}
              className="size-4 shrink-0 rounded border-border"
            />
            {output.name}
          </label>
        ))}
      </div>
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Salvar telas</Button>
    </form>
  );
}

type AgendaPanel = "edit" | "outputs";

// Ícone renderizado (não componente) — react-hooks/static-components não aceita <Icon /> com uma
// referência de componente calculada em runtime (mesmo padrão de renderAddOptionIcon em
// playlists-section.tsx).
function renderAgendaPanelIcon(panel: AgendaPanel): ReactNode {
  const className = "size-3.5";
  switch (panel) {
    case "edit":
      return <Pencil className={className} aria-hidden="true" />;
    case "outputs":
      return <Tv className={className} aria-hidden="true" />;
  }
}

const AGENDA_PANEL_LABEL: Record<AgendaPanel, string> = {
  edit: "Editar",
  outputs: "Onde aparece",
};

// Chips (Editar / Onde aparece) + um único painel visível por vez, em vez dos formulários sempre
// abertos empilhados — mesmo racional de PlaylistAddSection (playlists-section.tsx): a agenda em
// si (nome/cor/duração/logo) já aparece resumida no cabeçalho, então editá-la é uma ação ocasional,
// não algo que precisa ocupar espaço o tempo todo. Eventos (o conteúdo do dia a dia) ficam fora
// daqui, sempre visíveis. "Responsáveis" saiu daqui — pedido explícito: uma aba só do Superadmin
// centraliza a atribuição de responsáveis de telas/playlists/agendas num único lugar (ver
// responsibles-section.tsx), em vez de espalhada por cada card individual.
function AgendaSettingsPanels({
  agenda,
  logoMedia,
  outputs,
  selectedOutputIds,
}: {
  agenda: BroadcastAgendaRecord;
  logoMedia: PickableMedia | null;
  outputs: BroadcastOutputRecord[];
  selectedOutputIds: string[];
}) {
  const [active, setActive] = useState<AgendaPanel | null>(null);
  const panels: AgendaPanel[] = ["edit", "outputs"];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {panels.map((panel) => (
          <button
            key={panel}
            type="button"
            onClick={() => setActive((current) => (current === panel ? null : panel))}
            className={
              active === panel
                ? "flex items-center gap-2 rounded-full border border-primary bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary ui-motion-base"
                : "flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-xs font-medium text-foreground ui-motion-base hover:border-ring"
            }
          >
            {renderAgendaPanelIcon(panel)}
            {AGENDA_PANEL_LABEL[panel]}
          </button>
        ))}
      </div>

      {active && (
        <div className="rounded-panel border border-border/60 bg-muted/20 p-3">
          {active === "edit" && <EditAgendaForm agenda={agenda} logoMedia={logoMedia} />}
          {active === "outputs" && <AgendaOutputsForm agendaId={agenda.id} outputs={outputs} selectedOutputIds={selectedOutputIds} />}
        </div>
      )}
    </div>
  );
}

const WEEKDAY_LABELS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function toTimeInputValue(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// Qualquer data com o dia da semana certo serve de âncora (weekly-recurrence.ts: só o dia da
// semana e o horário do anchor importam pra evento recorrente, nunca a data em si) — não faz
// sentido pedir uma data específica quando o operador já disse "toda quarta".
function buildWeekdayAnchor(weekday: number, time: string): Date {
  const [hours, minutes] = time.split(":").map(Number);
  const anchor = new Date();
  anchor.setHours(hours || 0, minutes || 0, 0, 0);
  anchor.setDate(anchor.getDate() + (weekday - anchor.getDay()));
  return anchor;
}

type ExtraDateRow = { key: string; start: string; end: string };

// "Outras datas" — para um evento que acontece em dias separados (ex: dia 10 e dia 15, sem nada
// entre eles). Cada linha tem início e término (opcional) próprios. Linhas repetíveis, serializadas
// num <input type="hidden" name="extraDates"> em JSON (mesmo padrão de setAgendaOutputs). Fica
// escondido quando "repete toda semana" está marcado (quem monta este componente já cuida disso) —
// e, escondido, o hidden input some do form, então a action recebe [] e o service não grava nada.
function ExtraDatesFields({ idPrefix, defaultExtraDates }: { idPrefix: string; defaultExtraDates: BroadcastAgendaEventDate[] }) {
  const [rows, setRows] = useState<ExtraDateRow[]>(() =>
    defaultExtraDates.map((date, index) => ({
      key: `initial-${index}`,
      start: toDatetimeLocalValue(date.startAt),
      end: date.endAt ? toDatetimeLocalValue(date.endAt) : "",
    })),
  );

  const serialized = JSON.stringify(
    rows.filter((row) => row.start).map((row) => ({ startAt: row.start, endAt: row.end || null })),
  );

  function addRow() {
    setRows((current) => [...current, { key: `new-${Date.now()}-${current.length}`, start: "", end: "" }]);
  }
  function removeRow(key: string) {
    setRows((current) => current.filter((row) => row.key !== key));
  }
  function patchRow(key: string, patch: Partial<Pick<ExtraDateRow, "start" | "end">>) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  return (
    <div className="space-y-2.5 border-t border-border/60 pt-3">
      <div>
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Outras datas</p>
        <p className="text-xs text-muted-foreground">
          Para um evento que acontece em dias separados. Cada data tem seu próprio horário. O card fica na TV até a última data passar.
        </p>
      </div>
      <input type="hidden" name="extraDates" value={serialized} />
      {rows.map((row) => (
        <div key={row.key} className="flex flex-wrap items-end gap-2.5 rounded-md border border-border/60 bg-muted/20 p-2.5">
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-extra-${row.key}-start`}>
              Começa
            </label>
            <Input
              id={`${idPrefix}-extra-${row.key}-start`}
              type="datetime-local"
              value={row.start}
              onChange={(event) => patchRow(row.key, { start: event.target.value })}
              className="w-52"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-extra-${row.key}-end`}>
              Termina (opcional)
            </label>
            <Input
              id={`${idPrefix}-extra-${row.key}-end`}
              type="datetime-local"
              value={row.end}
              min={row.start || undefined}
              onChange={(event) => patchRow(row.key, { end: event.target.value })}
              className="w-52"
            />
          </div>
          <Button type="button" variant="outline" size="sm" onClick={() => removeRow(row.key)}>
            Remover
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={addRow}>
        Adicionar data
      </Button>
    </div>
  );
}

// Campos de data/hora do evento — separados (não mais um único <input type="datetime-local">) e
// com um modo dedicado pra recorrência: marcando "repete toda semana", o campo de data específica
// vira um seletor de dia da semana (informar o dia da semana já basta, não precisa também de uma
// data — mesmo racional de buildWeekdayAnchor acima). O <input type="hidden" name="startAt">
// computado mantém o server action (createAgendaEventAction/updateAgendaEventAction) exatamente
// como já era, sem tocar backend.
function AgendaEventDateTimeFields({
  idPrefix,
  defaultDate,
  defaultRecurring,
  defaultEndAt,
  defaultExtraDates,
}: {
  idPrefix: string;
  defaultDate: Date;
  defaultRecurring: boolean;
  defaultEndAt?: Date | null;
  // Datas avulsas já cadastradas (só no form de editar) — pré-preenchem "Outras datas".
  defaultExtraDates?: BroadcastAgendaEventDate[];
}) {
  const [recurring, setRecurring] = useState(defaultRecurring);
  const [date, setDate] = useState(() => toDateInputValue(defaultDate));
  const [time, setTime] = useState(() => toTimeInputValue(defaultDate));
  const [weekday, setWeekday] = useState(defaultDate.getDay());
  // Dia e horário do término em campos SEPARADOS, os dois opcionais — pedido explícito: "o dia do
  // término precisa ser outro campo, e opcional" (correção de um único <input type="datetime-local">
  // que misturava os dois, confuso de preencher só a hora sem escolher uma data). endDate vazio
  // não significa "sem término" — significa "termina no mesmo dia do início" (ver effectiveEndDate
  // abaixo); só endTime vazio desliga o término inteiro.
  const [endDate, setEndDate] = useState(() => (defaultEndAt ? toDateInputValue(defaultEndAt) : ""));
  const [endTime, setEndTime] = useState(() => (defaultEndAt ? toTimeInputValue(defaultEndAt) : ""));

  const startAt = recurring ? buildWeekdayAnchor(weekday, time) : new Date(`${date}T${time || "00:00"}`);
  const startAtValue = Number.isNaN(startAt.getTime()) ? "" : toDatetimeLocalValue(startAt);

  // Sem endDate escolhido, mas com endTime preenchido: assume o MESMO dia do início — cobre o caso
  // comum (evento termina no mesmo dia) sem obrigar a escolher uma data toda vez; só precisa
  // preencher endDate pra um término explicitamente em outro dia (evento de dias).
  const effectiveEndDate = endDate || (endTime ? toDateInputValue(startAt) : "");
  const endAtValue = endTime && effectiveEndDate ? `${effectiveEndDate}T${endTime}` : "";

  const endTimeField = (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">Término (opcional)</p>
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-end-date`}>
            Dia (opcional)
          </label>
          <Input
            id={`${idPrefix}-end-date`}
            type="date"
            value={endDate}
            onChange={(event) => setEndDate(event.target.value)}
            min={startAtValue ? toDateInputValue(startAt) : undefined}
            className="w-40"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" htmlFor={`${idPrefix}-end-time`}>
            Horário
          </label>
          <Input id={`${idPrefix}-end-time`} type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} className="w-28" />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        {endTime && !endDate
          ? "Sem dia escolhido, termina no mesmo dia do início."
          : "Escolha um dia diferente pra um evento que dura mais de um dia."}
      </p>
    </div>
  );

  function handleRecurringChange(checked: boolean) {
    if (checked) {
      // Ligando recorrência: já parte do dia da semana da data escolhida até agora, em vez de
      // resetar pro dia atual.
      const [year, month, day] = date.split("-").map(Number);
      setWeekday(new Date(year, month - 1, day).getDay());
    } else {
      // Desligando: a data volta a ser específica — usa a data efetiva da âncora recorrente (dia
      // da semana + horário já escolhidos), não a data original do form.
      setDate(toDateInputValue(startAt));
    }
    setRecurring(checked);
  }

  return (
    // Bloco próprio ("Quando") separado do resto do card por um divisor, mesmo nível hierárquico
    // de "Eventos" em AgendaCard (rótulo uppercase pequeno) — data/hora/recorrência formam um
    // único grupo de decisão, não três campos soltos.
    <div className="space-y-3 border-t border-border/60 pt-3">
      <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Quando</p>
      <input type="hidden" name="startAt" value={startAtValue} />
      <input type="hidden" name="recurring" value={recurring ? "on" : ""} />
      <input type="hidden" name="endAt" value={endAtValue} />

      <div className="flex items-center gap-2.5">
        <Switch id={`${idPrefix}-recurring`} checked={recurring} onCheckedChange={handleRecurringChange} />
        <label className="text-sm text-foreground" htmlFor={`${idPrefix}-recurring`}>
          Repete toda semana
        </label>
      </div>

      {recurring ? (
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${idPrefix}-weekday`}>
              Dia da semana
            </label>
            <Select value={String(weekday)} onValueChange={(value) => setWeekday(Number(value))}>
              <SelectTrigger id={`${idPrefix}-weekday`} className="w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {WEEKDAY_LABELS.map((label, index) => (
                  <SelectItem key={label} value={String(index)}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${idPrefix}-time`}>
              Horário
            </label>
            <Input id={`${idPrefix}-time`} type="time" value={time} onChange={(event) => setTime(event.target.value)} required className="w-28" />
          </div>
          {endTimeField}
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2.5">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${idPrefix}-date`}>
              Data
            </label>
            <Input id={`${idPrefix}-date`} type="date" value={date} onChange={(event) => setDate(event.target.value)} required className="w-40" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${idPrefix}-time`}>
              Horário
            </label>
            <Input id={`${idPrefix}-time`} type="time" value={time} onChange={(event) => setTime(event.target.value)} required className="w-28" />
          </div>
          {endTimeField}
        </div>
      )}

      {recurring && startAtValue && (
        <p className="text-xs text-muted-foreground">
          Próxima ocorrência: {formatEventDate(resolveEventOccurrenceDate({ startAt, recurring: true }))}
          {(() => {
            // Preview do término já resolvido pra próxima ocorrência (mesma duração, semana
            // seguinte) — não a data crua digitada, que pode estar semanas/meses no passado se o
            // operador só estava ajustando a duração (mesmo racional de resolveEventEndDate).
            const parsedEndAt = endAtValue ? new Date(endAtValue) : null;
            if (!parsedEndAt || Number.isNaN(parsedEndAt.getTime())) return null;
            const resolvedEnd = resolveEventEndDate({ startAt, endAt: parsedEndAt, recurring: true });
            return resolvedEnd && ` – ${formatEventDate(resolvedEnd)}`;
          })()}
        </p>
      )}

      {/* Datas avulsas só existem pra evento de data única — escondido (e ignorado pelo backend)
          quando "repete toda semana". */}
      {!recurring && <ExtraDatesFields idPrefix={idPrefix} defaultExtraDates={defaultExtraDates ?? []} />}
    </div>
  );
}

function CreateAgendaEventForm({ agendaId, onAdded }: { agendaId: string; onAdded: () => void }) {
  const [state, formAction, pending] = useActionState(createAgendaEventAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Evento criado.", onSuccess: onAdded });
  const formId = `${agendaId}-create-event`;

  return (
    <Card size="sm" className="bg-muted/20">
      <CardHeader>
        <CardTitle>Novo evento</CardTitle>
      </CardHeader>
      <CardContent>
        <form id={formId} action={formAction} className="space-y-4">
          <input type="hidden" name="agendaId" value={agendaId} />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${agendaId}-title`}>Título</label>
            <Input id={`${agendaId}-title`} name="title" placeholder="Reunião geral" required className="w-full" />
          </div>
          <AgendaEventDateTimeFields idPrefix={`${agendaId}-create`} defaultDate={new Date()} defaultRecurring={false} />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${agendaId}-description`}>Descrição (opcional)</label>
            <Textarea id={`${agendaId}-description`} name="description" rows={2} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${agendaId}-location`}>Local (opcional)</label>
            <Input id={`${agendaId}-location`} name="location" placeholder="Sala 3, Auditório..." className="w-full" />
          </div>
          <MediaPickerField name="coverMediaAssetId" label="Imagem de capa (opcional)" />
        </form>
      </CardContent>
      <CardFooter>
        <Button type="submit" form={formId} disabled={pending} className="w-full sm:w-auto">Criar evento</Button>
      </CardFooter>
    </Card>
  );
}

function DeleteAgendaEventButton({ eventId }: { eventId: string }) {
  return (
    <ConfirmDeleteButton
      action={deleteAgendaEventAction}
      fields={{ eventId }}
      title="Remover evento"
      description="Apagar este evento da agenda?"
      confirmLabel="Remover"
      successMessage="Evento removido."
      icon={<Trash2 className="size-4" />}
      label="Remover evento"
    />
  );
}

function formatEventDate(startAt: string | Date): string {
  const date = typeof startAt === "string" ? new Date(startAt) : startAt;
  // Dia da semana explícito (não só a data numérica) — pedido explícito: "existem eventos que são
  // recorrentes toda semana, vale colocar o dia da semana na view".
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "short" }).replace(".", "");
  const rest = date.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return `${weekday}, ${rest}`;
}

// "" quando não tem término definido. endAt agora é um timestamp completo (pode cair em qualquer
// data posterior ao início, inclusive dias depois) — no MESMO dia do início mostra só a hora
// ("– 21:00"), em outro dia mostra a data do término também ("– 14/03 18:00"), senão um evento
// overnight ("22:00 – 02:00") parece um término antes do início por engano. Mesma lógica de
// formatEndTimeSuffix em layer-renderer.tsx (view de saída), versão admin (texto por extenso).
function formatEndTimeSuffix(startAt: string | Date, endAt: string | Date | null): string {
  if (!endAt) return "";
  const start = typeof startAt === "string" ? new Date(startAt) : startAt;
  const end = typeof endAt === "string" ? new Date(endAt) : endAt;
  const endTime = end.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (end.toDateString() === start.toDateString()) return ` – ${endTime}`;
  const endDay = end.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return ` – ${endDay} ${endTime}`;
}

// "Toda quarta-feira" etc — mostrado ao lado da data da próxima ocorrência (formatEventDate já
// resolve pra data efetiva, ver AgendaEventRow), pra deixar claro que aquela data é só a próxima,
// não a única. Pedido real: "quero criar um evento que acontece toda semana [...] não quero ter
// que ficar trocando a data toda semana".
function formatRecurringBadge(startAt: string | Date): string {
  const date = typeof startAt === "string" ? new Date(startAt) : startAt;
  const weekday = date.toLocaleDateString("pt-BR", { weekday: "long" });
  return `Toda ${weekday}`;
}

// <input type="datetime-local"> espera "YYYY-MM-DDTHH:mm" em horário local (sem timezone) — usa
// os getters locais do Date, não toISOString() (que converteria pra UTC e desalinharia a hora
// mostrada da hora realmente salva).
function toDatetimeLocalValue(startAt: string | Date): string {
  const date = typeof startAt === "string" ? new Date(startAt) : startAt;
  return `${toDateInputValue(date)}T${toTimeInputValue(date)}`;
}

function EditAgendaEventForm({
  event,
  coverMedia,
  onDone,
}: {
  event: BroadcastAgendaEventRecord;
  coverMedia: PickableMedia | null;
  onDone: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateAgendaEventAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Evento atualizado.", onSuccess: onDone });
  const formId = `${event.id}-edit-event`;

  return (
    <Card
      // Mesmo racional do key em EditAgendaForm: força remontar o card inteiro (e seus inputs não
      // controlados) quando o registro muda, senão o formulário fica mostrando dado velho depois
      // de salvar mesmo com o banco já atualizado.
      key={`${event.id}-${event.updatedAt.getTime()}`}
      size="sm"
      className="mt-2 bg-muted/30"
    >
      <CardHeader>
        <CardTitle>Editar evento</CardTitle>
      </CardHeader>
      <CardContent>
        <form id={formId} action={formAction} className="space-y-4">
          <input type="hidden" name="eventId" value={event.id} />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${event.id}-edit-title`}>Título</label>
            <Input id={`${event.id}-edit-title`} name="title" defaultValue={event.title} required className="w-full" />
          </div>
          <AgendaEventDateTimeFields
            idPrefix={`${event.id}-edit`}
            // Pra evento recorrente, parte da PRÓXIMA ocorrência (não a âncora crua, que pode ser
            // de meses atrás) — mais intuitivo pro admin, e salvar sem trocar o dia da semana
            // mantém o mesmo padrão de recorrência, só "avança" a âncora. defaultEndAt segue o
            // mesmo racional (resolveEventEndDate preserva a DURAÇÃO original, não a data crua).
            defaultDate={resolveEventOccurrenceDate(event)}
            defaultRecurring={event.recurring}
            defaultEndAt={resolveEventEndDate(event)}
            defaultExtraDates={event.extraDates}
          />
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${event.id}-edit-description`}>Descrição (opcional)</label>
            <Textarea id={`${event.id}-edit-description`} name="description" defaultValue={event.description ?? ""} rows={2} className="w-full" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground" htmlFor={`${event.id}-edit-location`}>Local (opcional)</label>
            <Input id={`${event.id}-edit-location`} name="location" defaultValue={event.location ?? ""} placeholder="Sala 3, Auditório..." className="w-full" />
          </div>
          <MediaPickerField name="coverMediaAssetId" label="Imagem de capa (opcional)" initialMedia={coverMedia} />
        </form>
      </CardContent>
      <CardFooter className="gap-2">
        <Button type="submit" form={formId} size="sm" disabled={pending}>Salvar</Button>
        <Button type="button" variant="outline" size="sm" onClick={onDone}>Cancelar</Button>
      </CardFooter>
    </Card>
  );
}

function AgendaEventRow({ event, coverMedia }: { event: BroadcastAgendaEventRecord; coverMedia: PickableMedia | null }) {
  const [editing, setEditing] = useState(false);
  // Ocorrência efetiva resolvida uma vez só (não-recorrente é no-op) — reaproveitada pela data
  // mostrada, pelo sufixo de término e pelo status "Acontecendo" abaixo, em vez de resolver três
  // vezes o mesmo evento.
  const resolvedStart = resolveEventOccurrenceDate(event);
  const resolvedEnd = resolveEventEndDate(event);
  // Pedido explícito: "quero o status de 'Acontecendo' no evento" — mesmo helper que já indica
  // isso na TV (shared/weekly-recurrence.ts), agora também no admin. Calculado no momento do
  // render (não ao vivo/ticking) — o admin não tem um relógio próprio como a view de saída, o
  // suficiente pra saber "está rolando agora" quando a página foi carregada/atualizada.
  const happeningNow = isEventHappeningNow(resolvedStart, resolvedEnd);

  return (
    // Tinta o cartão inteiro (não só o badge) quando o evento está rolando agora — dá pra notar
    // "isto está na TV neste instante" olhando a lista inteira, não só quem já reparou no badge.
    <div className={`rounded-panel border p-2.5 text-sm ${happeningNow ? "border-primary/40 bg-primary/10" : "border-border bg-muted/40"}`}>
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          {happeningNow && (
            <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
              Acontecendo
            </span>
          )}
          {event.recurring && (
            <span className="shrink-0 rounded-full bg-accent/14 px-2 py-0.5 text-[11px] text-muted-foreground">
              {formatRecurringBadge(event.startAt)}
            </span>
          )}
          {event.coverMediaAssetId && (
            <span className="shrink-0 rounded-full bg-accent/14 px-2 py-0.5 text-[11px] text-muted-foreground">com capa</span>
          )}
          {event.extraDates.length > 0 && (
            <span className="shrink-0 rounded-full bg-accent/14 px-2 py-0.5 text-[11px] text-muted-foreground">
              {event.extraDates.length + 1} datas
            </span>
          )}
          <div className="min-w-0">
            <p className="truncate font-medium text-foreground">{event.title}</p>
            {/* Data mostrada é sempre a PRÓXIMA ocorrência (resolveEventOccurrenceDate é no-op pra
                evento não-recorrente) — pedido real: "mostre a data da quarta próxima". */}
            <p className="truncate text-xs text-muted-foreground">
              {formatEventDate(resolvedStart)}
              {formatEndTimeSuffix(resolvedStart, resolvedEnd)}
            </p>
            {event.extraDates.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Também:{" "}
                {event.extraDates
                  .map((date) => `${formatEventDate(date.startAt)}${formatEndTimeSuffix(date.startAt, date.endAt)}`)
                  .join("  ·  ")}
              </p>
            )}
            {event.description && <p className="truncate text-xs text-muted-foreground">{event.description}</p>}
            {event.location && (
              <p className="flex items-center gap-1 truncate text-xs text-muted-foreground">
                <MapPin className="size-3 shrink-0" />
                {event.location}
              </p>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setEditing((previous) => !previous)}
            aria-label={editing ? "Fechar edição" : "Editar evento"}
          >
            <Pencil className="size-4" />
          </Button>
          <DeleteAgendaEventButton eventId={event.id} />
        </div>
      </div>
      {editing && <EditAgendaEventForm event={event} coverMedia={coverMedia} onDone={() => setEditing(false)} />}
    </div>
  );
}

// Mesmo modelo de card de Telas/Playlists (outputs-section.tsx/playlists-section.tsx) — pedido
// explícito: "vamos aplicar a mesma lógica de design/layout em Agendas". Card fechável (botão na
// CardAction, não mais Accordion) mantendo cor+nome+status sempre visíveis; CardContent
// (configurações + eventos) some quando fechado; CardFooter com "Novo evento" continua de pé mesmo
// fechado, cor própria (primary sólido), mesma ideia de "Adicionar item"/"Copiar link" nos outros
// dois. Collapsed começa false (aberto) — pedido explícito: "os cards não devem começar
// colapsados".
function AgendaCard({
  agenda,
  events,
  logoMedia,
  eventCoverMediaById,
  outputs,
  selectedOutputIds,
  canManageAll,
  dragRootProps,
  setNodeRef,
  style,
  isDragging,
}: {
  agenda: BroadcastAgendaRecord;
  events: BroadcastAgendaEventRecord[];
  logoMedia: PickableMedia | null;
  eventCoverMediaById: Record<string, PickableMedia | null>;
  outputs: BroadcastOutputRecord[];
  selectedOutputIds: string[];
  canManageAll: boolean;
  dragRootProps: HTMLAttributes<HTMLElement>;
  setNodeRef: (node: HTMLElement | null) => void;
  style: CSSProperties;
  isDragging: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [addingEvent, setAddingEvent] = useState(false);
  const status = agendaItemStatus(events.length, selectedOutputIds.length);

  return (
    <div ref={setNodeRef} style={style} className={isDragging ? "opacity-60" : ""}>
      {/* Mesma faixa colorida por status já usada nos cards de Tela e de Playlist — o mesmo sinal
          (verde = tem evento vinculado a alguma tela, âmbar = precisa de atenção) em toda área do
          plugin. */}
      <Card className={`gap-3 border-l-4 ${STATUS_BORDER_CLASSNAME[status.tone]}`}>
        <CardHeader>
          <div className="flex min-w-0 items-center gap-1.5">
            {canManageAll && (
              <span
                {...dragRootProps}
                aria-label="Arrastar para reordenar"
                className="flex size-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-muted-foreground ui-motion-base hover:bg-muted hover:text-foreground active:cursor-grabbing"
              >
                <GripVertical className="size-4" aria-hidden="true" />
              </span>
            )}
            <span
              aria-hidden="true"
              className="size-3 shrink-0 rounded-full border border-border"
              style={{ background: agenda.backgroundColor ?? DEFAULT_AGENDA_COLOR }}
            />
            <CardTitle className="min-w-0 truncate">{agenda.name}</CardTitle>
          </div>
          <CardAction className="flex items-center gap-1">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => setCollapsed((previous) => !previous)}
              aria-label={collapsed ? "Expandir agenda" : "Recolher agenda"}
            >
              {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
            </Button>
            {canManageAll && (
              <DeleteAgendaButton
                agendaId={agenda.id}
                linkedScreenNames={outputs.filter((output) => selectedOutputIds.includes(output.id)).map((output) => output.name)}
              />
            )}
          </CardAction>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
            <span className="text-xs text-muted-foreground">{agenda.displaySeconds}s na tela</span>
          </div>
        </CardHeader>
        {/* Cada seção com rótulo + frase de contexto curta, separadas por divisor — mesmo padrão
            de Telas/Playlists ("é difícil identificar o que é cada seção, qual é o contexto de
            cada opção"). */}
        {!collapsed && (
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Configurações</p>
              <p className="text-xs text-muted-foreground">Nome, cor, logo e em quais telas esta agenda aparece.</p>
              {canManageAll ? (
                <AgendaSettingsPanels agenda={agenda} logoMedia={logoMedia} outputs={outputs} selectedOutputIds={selectedOutputIds} />
              ) : (
                // Editor de agenda restrito (sem broadcast.manage) só edita a agenda em si —
                // vínculo agenda↔saída continua ação de quem administra tudo; atribuição de
                // responsáveis é sempre exclusiva do Superadmin (ver responsibles-section.tsx),
                // nunca aparece aqui.
                <EditAgendaForm agenda={agenda} logoMedia={logoMedia} />
              )}
            </div>
            <div className="space-y-2 border-t border-border/60 pt-4">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Eventos</p>
                  <p className="text-xs text-muted-foreground">O que aparece na coluna de agenda da tela.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setAddingEvent((previous) => !previous)}
                  className="flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1 text-xs font-medium text-foreground ui-motion-base hover:border-ring"
                >
                  <CalendarPlus className="size-3.5" aria-hidden="true" />
                  Novo evento
                </button>
              </div>

              {addingEvent && <CreateAgendaEventForm agendaId={agenda.id} onAdded={() => setAddingEvent(false)} />}

              {canManageAll && (
                <details className="rounded-panel border border-border/60 bg-muted/20 p-2.5">
                  <summary className="cursor-pointer text-xs font-medium text-foreground">Importar de planilha (CSV)</summary>
                  <div className="mt-2">
                    <ImportAgendaCsvForm agendaId={agenda.id} />
                  </div>
                </details>
              )}

              <div className="space-y-2">
                {events.map((event) => (
                  <AgendaEventRow key={event.id} event={event} coverMedia={eventCoverMediaById[event.id] ?? null} />
                ))}
                {events.length === 0 && <p className="text-xs text-muted-foreground">Nenhum evento nesta agenda ainda.</p>}
              </div>
            </div>
          </CardContent>
        )}
        <CardFooter className="border-t-primary/20 bg-primary/8">
          {/* Bug real reportado: este botão só abria o card (setCollapsed(false)), nunca o
              formulário — parecia quebrado, já que era o botão mais visível do card (primary
              sólido, largura cheia) contra o link discreto de dentro (perto de "Eventos"). Agora
              expande e já abre o formulário de criação num único clique. */}
          <Button
            type="button"
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => {
              setCollapsed(false);
              setAddingEvent(true);
            }}
          >
            <CalendarPlus className="size-4" />
            Novo evento
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

// Arrasta pra reordenar as agendas (SortableList, ver sortable-list.tsx) — só quem administra tudo
// pode reordenar (disabled quando !canManageAll, mesmo gate que os antigos botões mover pra cima/
// baixo já tinham). Mesmo padrão otimista de SortablePlaylistItems (playlists-section.tsx): ordem
// local reage na hora, o formulário escondido dispara reorderAgendasAction de verdade logo depois.
function SortableAgendaList({
  agendas,
  disabled,
  children,
}: {
  agendas: BroadcastAgendaRecord[];
  disabled: boolean;
  children: (agenda: BroadcastAgendaRecord, props: SortableRowRenderProps) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(reorderAgendasAction, initialState);
  useActionToast({ pending, error: state.error });
  const formRef = useRef<HTMLFormElement>(null);
  const agendaIdsInputRef = useRef<HTMLInputElement>(null);

  const serverOrder = useMemo(() => agendas.map((agenda) => agenda.id), [agendas]);
  const [order, setOrder] = useState(serverOrder);
  // Ressincroniza a ordem local sempre que a lista de agendas muda de fora — mesmo racional de
  // SortablePlaylistItems (playlists-section.tsx): setState direto no corpo do render (não num
  // efeito), guardado por comparação de conteúdo.
  const [prevServerOrder, setPrevServerOrder] = useState(serverOrder);
  if (serverOrder.join(",") !== prevServerOrder.join(",")) {
    setPrevServerOrder(serverOrder);
    setOrder(serverOrder);
  }
  const agendaById = useMemo(() => new Map(agendas.map((agenda) => [agenda.id, agenda])), [agendas]);

  function handleReorder(nextOrder: string[]) {
    setOrder(nextOrder);
    if (agendaIdsInputRef.current) agendaIdsInputRef.current.value = JSON.stringify(nextOrder);
    formRef.current?.requestSubmit();
  }

  return (
    <>
      <form ref={formRef} action={formAction} className="hidden">
        <input type="hidden" name="agendaIds" ref={agendaIdsInputRef} defaultValue={JSON.stringify(serverOrder)} />
      </form>
      <SortableList ids={order} onReorder={handleReorder} disabled={disabled}>
        {(id, props) => {
          const agenda = agendaById.get(id);
          if (!agenda) return null;
          return children(agenda, props);
        }}
      </SortableList>
    </>
  );
}

export function AgendaSection({
  agendas,
  eventsByAgenda,
  agendaLogoMediaById,
  eventCoverMediaById,
  outputs,
  agendaOutputIdsByAgendaId,
  canManageAll = true,
}: {
  agendas: BroadcastAgendaRecord[];
  eventsByAgenda: Record<string, BroadcastAgendaEventRecord[]>;
  agendaLogoMediaById: Record<string, PickableMedia | null>;
  eventCoverMediaById: Record<string, PickableMedia | null>;
  outputs: BroadcastOutputRecord[];
  agendaOutputIdsByAgendaId: Record<string, string[]>;
  // false pra um ator sem broadcast.manage (só broadcast.agenda.manage — "responsável" por
  // agendas específicas, ver page.tsx) — esconde criar/apagar/reordenar agenda e o vínculo
  // agenda↔saída, que continuam ação de quem administra tudo. Atribuição de responsáveis nunca
  // aparece aqui — é exclusiva do Superadmin, ver responsibles-section.tsx.
  canManageAll?: boolean;
}) {
  return (
    <div className="space-y-4">
      {canManageAll && <CreateAgendaForm />}
      {agendas.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {canManageAll
            ? 'Nenhuma agenda cadastrada ainda — crie uma (ex: "Semanal") pra começar a adicionar eventos.'
            : "Nenhuma agenda foi atribuída a você ainda."}
        </p>
      )}
      {/* Grid de cards, mesmo padrão de Telas/Playlists — mobile primeiro (1 coluna), 2 a partir
          de sm, 3 a partir de xl (AGENTS.md seção 4). items-start evita o esticamento padrão do
          Grid (ver outputs-section.tsx): sem isso, abrir uma agenda numa linha esticaria as
          outras da mesma linha pro mesmo tamanho, mesmo fechadas. Drag-and-drop (SortableAgendaList)
          por dentro do grid — a reordenação em si continua exclusiva de quem administra tudo
          (disabled={!canManageAll}, mesmo gate que os antigos botões mover pra cima/baixo já
          tinham). */}
      <div className="grid grid-cols-1 items-start gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <SortableAgendaList agendas={agendas} disabled={!canManageAll}>
          {(agenda, { setNodeRef, style, dragRootProps, isDragging }) => (
            <AgendaCard
              key={agenda.id}
              agenda={agenda}
              events={eventsByAgenda[agenda.id] ?? []}
              logoMedia={agendaLogoMediaById[agenda.id] ?? null}
              eventCoverMediaById={eventCoverMediaById}
              outputs={outputs}
              selectedOutputIds={agendaOutputIdsByAgendaId[agenda.id] ?? []}
              canManageAll={canManageAll}
              dragRootProps={dragRootProps}
              setNodeRef={setNodeRef}
              style={style}
              isDragging={isDragging}
            />
          )}
        </SortableAgendaList>
      </div>
    </div>
  );
}
