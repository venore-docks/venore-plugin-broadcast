"use client";

import { useActionState, useRef, useState } from "react";
import { Input } from "@venore/plugin-sdk/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
import { BROADCAST_TIMEZONE_OPTIONS } from "../../shared/timezone";
import {
  updateBroadcastAgendaAnimationStyleAction,
  updateBroadcastAgendaViewSizeAction,
  updateBroadcastBrandColorAction,
  updateBroadcastNewsExcludeKeywordsAction,
  updateBroadcastRegionAction,
  updateBroadcastTimezoneAction,
  type BroadcastActionState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };

// Todos os campos desta aba salvam SOZINHOS (no blur pra texto/cor, na hora pra Select) — sem
// botão "Salvar" — pra ficar consistente com o resto do admin do plugin (os sliders de ciclo da
// agenda em outputs-section.tsx já fazem isso via onValueCommit). Um não-dev não precisa lembrar
// de clicar em nada. requestSubmit() num form escondido dispara a mesma server action de antes.
const AUTOSAVE_HINT = "Salvo automaticamente.";

function AutosaveTextForm({
  action,
  name,
  label,
  help,
  defaultValue,
  placeholder,
  successMessage,
  type = "text",
}: {
  action: (state: BroadcastActionState, formData: FormData) => Promise<BroadcastActionState>;
  name: string;
  label: string;
  help: string;
  defaultValue: string;
  placeholder?: string;
  successMessage: string;
  type?: "text" | "color";
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToast({ pending, error: state.error, successMessage });
  const formRef = useRef<HTMLFormElement>(null);
  const lastSavedRef = useRef(defaultValue);

  function maybeSave(value: string) {
    if (value === lastSavedRef.current) return;
    lastSavedRef.current = value;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="max-w-xl space-y-2 rounded-panel border border-border bg-card p-3">
      <label className="text-sm font-medium text-foreground" htmlFor={`broadcast-setting-${name}`}>{label}</label>
      <p className="text-xs text-muted-foreground">{help}</p>
      {type === "color" ? (
        <input
          id={`broadcast-setting-${name}`}
          name={name}
          type="color"
          defaultValue={defaultValue}
          disabled={pending}
          onBlur={(event) => maybeSave(event.target.value)}
          className="h-9 w-16 cursor-pointer rounded-md border border-border"
        />
      ) : (
        <Input
          id={`broadcast-setting-${name}`}
          name={name}
          defaultValue={defaultValue}
          placeholder={placeholder}
          disabled={pending}
          onBlur={(event) => maybeSave(event.target.value)}
        />
      )}
      <p className="text-xs text-muted-foreground">{AUTOSAVE_HINT}</p>
    </form>
  );
}

function AutosaveSelectForm({
  action,
  name,
  label,
  help,
  value: initialValue,
  options,
  successMessage,
}: {
  action: (state: BroadcastActionState, formData: FormData) => Promise<BroadcastActionState>;
  name: string;
  label: string;
  help: string;
  value: string;
  options: { value: string; label: string }[];
  successMessage: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  useActionToast({ pending, error: state.error, successMessage });
  const formRef = useRef<HTMLFormElement>(null);
  const hiddenInputRef = useRef<HTMLInputElement>(null);
  const [value, setValue] = useState(initialValue);

  function handleChange(next: string) {
    setValue(next);
    // Escreve direto no ref do input escondido ANTES do requestSubmit(), em vez de depender de o
    // valor controlado por `value` já ter re-renderizado no DOM (mesmo cuidado de
    // SetOutputPlaylistForm em outputs-section.tsx).
    if (hiddenInputRef.current) hiddenInputRef.current.value = next;
    formRef.current?.requestSubmit();
  }

  return (
    <form ref={formRef} action={formAction} className="max-w-xl space-y-2 rounded-panel border border-border bg-card p-3">
      <label className="text-sm font-medium text-foreground" htmlFor={`broadcast-setting-${name}`}>{label}</label>
      <p className="text-xs text-muted-foreground">{help}</p>
      <input type="hidden" name={name} ref={hiddenInputRef} defaultValue={value} />
      <Select value={value} onValueChange={handleChange} disabled={pending}>
        <SelectTrigger id={`broadcast-setting-${name}`} className="w-full sm:w-96">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">{AUTOSAVE_HINT}</p>
    </form>
  );
}

export function SettingsSection({
  region,
  timezone,
  brandColor,
  newsExcludeKeywords,
  agendaAnimationStyle,
  agendaViewSize,
}: {
  region: string;
  timezone: string;
  brandColor: string;
  newsExcludeKeywords: string;
  agendaAnimationStyle: string;
  agendaViewSize: string;
}) {
  const knownTimezone = BROADCAST_TIMEZONE_OPTIONS.some((option) => option.value === timezone)
    ? timezone
    : BROADCAST_TIMEZONE_OPTIONS[0].value;

  return (
    <div className="space-y-4">
      <AutosaveSelectForm
        action={updateBroadcastTimezoneAction}
        name="timezone"
        label="Fuso horário da instituição"
        help="Usado pra entender o horário que você digita nos eventos da agenda e pra mostrar as datas na TV. A tela mostra sempre o horário da instituição, mesmo instalada em outra cidade ou fuso."
        value={knownTimezone}
        options={BROADCAST_TIMEZONE_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
        successMessage="Fuso horário salvo."
      />
      <AutosaveTextForm
        action={updateBroadcastRegionAction}
        name="region"
        label="Região (cidade)"
        help='Usada pelas camadas "Relógio e clima" e "Notícias da região". Digite o nome da cidade.'
        defaultValue={region}
        placeholder="Curitiba, PR"
        successMessage="Região salva."
      />
      <AutosaveTextForm
        action={updateBroadcastBrandColorAction}
        name="brandColor"
        label="Cor da barra de marca"
        help="Fundo da barra inferior da view principal (vídeo/playlist) — mostra a logo, o relógio e a temperatura."
        defaultValue={brandColor}
        successMessage="Cor da marca salva."
        type="color"
      />
      <AutosaveSelectForm
        action={updateBroadcastAgendaAnimationStyleAction}
        name="agendaAnimationStyle"
        label="Estilo de animação da agenda"
        help='Como os cards de evento entram na tela ao trocar de agenda no rodízio da camada "Agenda".'
        value={agendaAnimationStyle === "cascade" ? "cascade" : "fade"}
        options={[
          { value: "fade", label: "Fade (bloco inteiro surge junto)" },
          { value: "cascade", label: "Cascata (cards entram em sequência, da direita)" },
        ]}
        successMessage="Estilo de animação salvo."
      />
      <AutosaveSelectForm
        action={updateBroadcastAgendaViewSizeAction}
        name="agendaViewSize"
        label="Tamanho da coluna de agenda e da barra de marca"
        help="Largura da coluna de agenda e altura da barra de marca (rodapé) na view principal — as duas crescem juntas."
        value={agendaViewSize === "padrao" || agendaViewSize === "extra-grande" ? agendaViewSize : "grande"}
        options={[
          { value: "padrao", label: "Padrão" },
          { value: "grande", label: "Grande" },
          { value: "extra-grande", label: "Extra grande" },
        ]}
        successMessage="Tamanho da view salvo."
      />
      <AutosaveTextForm
        action={updateBroadcastNewsExcludeKeywordsAction}
        name="newsExcludeKeywords"
        label="Excluir notícias com estas palavras"
        help="Qualquer manchete cujo título contenha uma destas palavras não aparece na TV. Separe por vírgula."
        defaultValue={newsExcludeKeywords}
        placeholder="futebol, política"
        successMessage="Palavras-chave salvas."
      />
    </div>
  );
}
