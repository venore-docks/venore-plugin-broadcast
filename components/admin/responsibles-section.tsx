"use client";

import { useActionState, useMemo, useRef, useState } from "react";
import { CalendarDays, ListVideo, Tv, UserPlus, X } from "lucide-react";
import { Button } from "@venore/plugin-sdk/ui";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@venore/plugin-sdk/ui";
import { useActionToast } from "@venore/plugin-sdk/ui";
// Importa direto de contracts/, nunca do barrel (@/plugins/broadcast) — mesmo racional de
// agenda-section.tsx/outputs-section.tsx/playlists-section.tsx: client component nunca pode
// arrastar o barrel de server (Drizzle/pg) pro bundle do browser.
import type { BroadcastAgendaRecord, BroadcastOutputRecord, BroadcastPlaylistRecord } from "../../contracts/types";
import {
  delegateOutputAction,
  setAgendaEditorsAction,
  setOutputEditorsAction,
  setPlaylistEditorsAction,
  type BroadcastActionState,
} from "./actions";

const initialState: BroadcastActionState = { error: null };

// Não importa UserRef de @/contexts/auth (barrel arrasta next-auth/server pro bundle do browser) —
// mesmo padrão de AssignRoleForm (admin/rbac/_components/assign-role-form.tsx): tipo inline,
// campos mínimos.
type AssignableUser = { id: string; name: string | null; email: string };

function userLabel(user: AssignableUser): string {
  return user.name ? `${user.name} (${user.email})` : user.email;
}

// ─────────────────────────────────────────────────────────────────────────────
// Atalho "Delegar a tela inteira" — pedido explícito: uma pessoa do setor vira responsável de TUDO
// que alimenta uma tela (a tela em si + a playlist que ela toca + as agendas vinculadas), numa
// ação só. O ajuste fino recurso a recurso fica na seção "Ajuste fino" abaixo. Como playlist agora
// é dedicada por tela (1:1 — ver database/schema/index.ts), "a playlist daquela tela" é sempre
// inequívoca; a resolução real (dedicada + a que a camada de vídeo aponta, se repontada) acontece
// no server (delegate-output/service.ts).
// ─────────────────────────────────────────────────────────────────────────────
function ScreenDelegationCard({
  output,
  delegatedUserIds,
  playlistName,
  linkedAgendaCount,
  assignableUsers,
}: {
  output: BroadcastOutputRecord;
  delegatedUserIds: string[];
  playlistName: string | null;
  linkedAgendaCount: number;
  assignableUsers: AssignableUser[];
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const userIdInputRef = useRef<HTMLInputElement>(null);
  const modeInputRef = useRef<HTMLInputElement>(null);

  const [state, formAction, pending] = useActionState(delegateOutputAction, initialState);
  useActionToast({ pending, error: state.error, successMessage: "Delegação atualizada." });

  const delegatedSet = new Set(delegatedUserIds);
  const delegated = assignableUsers.filter((user) => delegatedSet.has(user.id));
  const available = assignableUsers.filter((user) => !delegatedSet.has(user.id));

  function submit(userId: string, mode: "grant" | "revoke") {
    if (userIdInputRef.current) userIdInputRef.current.value = userId;
    if (modeInputRef.current) modeInputRef.current.value = mode;
    formRef.current?.requestSubmit();
  }

  const scopeLabel = [
    "esta tela",
    playlistName ? `a playlist “${playlistName}”` : "a playlist dela",
    linkedAgendaCount > 0 ? `${linkedAgendaCount} agenda${linkedAgendaCount === 1 ? "" : "s"} vinculada${linkedAgendaCount === 1 ? "" : "s"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-2 rounded-panel border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <Tv className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <span className="truncate text-sm font-medium text-foreground">{output.name}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Quem for delegado aqui passa a poder editar: {scopeLabel}. Precisa também ter os papéis
        &quot;Editar telas/playlists/agendas atribuídas&quot; em Papéis e Permissões.
      </p>

      <form ref={formRef} action={formAction}>
        <input type="hidden" name="outputId" value={output.id} />
        <input type="hidden" name="userId" ref={userIdInputRef} defaultValue="" />
        <input type="hidden" name="mode" ref={modeInputRef} defaultValue="grant" />
      </form>

      {delegated.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {delegated.map((user) => (
            <span
              key={user.id}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground"
            >
              <span className="truncate">{user.name ?? user.email}</span>
              <button
                type="button"
                onClick={() => submit(user.id, "revoke")}
                disabled={pending}
                aria-label={`Remover ${user.name ?? user.email} desta tela`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Ninguém delegado ainda.</p>
      )}

      {available.length > 0 && (
        <div className="flex items-center gap-2">
          <UserPlus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <Select value="" onValueChange={(userId) => submit(userId, "grant")} disabled={pending}>
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue placeholder="Delegar tela para…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((user) => (
                <SelectItem key={user.id} value={user.id}>
                  {userLabel(user)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Ajuste fino — o conjunto exato de responsáveis de UM recurso (a mesma UI de antes). Fica atrás
// de um <details> porque o caminho comum agora é "Delegar a tela inteira" acima; isto é pra casos
// pontuais (ex: uma agenda da Capelania que não está vinculada a nenhuma tela).
// ─────────────────────────────────────────────────────────────────────────────
type ResourceKind = "output" | "playlist" | "agenda";

const RESOURCE_ID_FIELD: Record<ResourceKind, string> = {
  output: "outputId",
  playlist: "playlistId",
  agenda: "agendaId",
};

const RESOURCE_ACTION = {
  output: setOutputEditorsAction,
  playlist: setPlaylistEditorsAction,
  agenda: setAgendaEditorsAction,
} as const;

const RESOURCE_PERMISSION_LABEL: Record<ResourceKind, string> = {
  output: "Editar telas atribuídas",
  playlist: "Editar playlists atribuídas",
  agenda: "Editar agendas atribuídas",
};

function ResourceEditorsForm({
  kind,
  resourceId,
  allUsers,
  selectedUserIds,
}: {
  kind: ResourceKind;
  resourceId: string;
  allUsers: AssignableUser[];
  selectedUserIds: string[];
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedUserIds));
  const [state, formAction, pending] = useActionState(RESOURCE_ACTION[kind], initialState);
  useActionToast({ pending, error: state.error, successMessage: "Responsáveis atualizados." });

  function toggle(userId: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  return (
    <form action={formAction} className="space-y-2 rounded-panel border border-border/60 bg-muted/20 p-2.5">
      <input type="hidden" name={RESOURCE_ID_FIELD[kind]} value={resourceId} />
      <input type="hidden" name="userIds" value={JSON.stringify([...selected])} />
      <p className="text-xs text-muted-foreground">
        Pessoas marcadas precisam também ter o papel &quot;{RESOURCE_PERMISSION_LABEL[kind]}&quot; em Papéis e Permissões — a atribuição
        sozinha não dá acesso.
      </p>
      {allUsers.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nenhum usuário cadastrado ainda.</p>
      ) : (
        <div className="flex max-h-40 flex-col gap-1.5 overflow-y-auto">
          {allUsers.map((user) => (
            <label key={user.id} className="flex items-center gap-1.5 text-sm text-foreground">
              <input
                type="checkbox"
                checked={selected.has(user.id)}
                onChange={() => toggle(user.id)}
                className="size-4 shrink-0 rounded border-border"
              />
              <span className="truncate">{userLabel(user)}</span>
            </label>
          ))}
        </div>
      )}
      <Button type="submit" size="sm" variant="outline" disabled={pending}>Salvar responsáveis</Button>
    </form>
  );
}

function ResourceEditorsRow({
  kind,
  resourceId,
  name,
  allUsers,
  selectedUserIds,
}: {
  kind: ResourceKind;
  resourceId: string;
  name: string;
  allUsers: AssignableUser[];
  selectedUserIds: string[];
}) {
  return (
    <details className="rounded-panel border border-border bg-card p-2.5">
      <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-foreground">{name}</span>
        <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">
          {selectedUserIds.length === 0 ? "sem responsável" : `${selectedUserIds.length} responsável${selectedUserIds.length === 1 ? "" : "eis"}`}
        </span>
      </summary>
      <div className="mt-2">
        <ResourceEditorsForm kind={kind} resourceId={resourceId} allUsers={allUsers} selectedUserIds={selectedUserIds} />
      </div>
    </details>
  );
}

export function ResponsiblesSection({
  outputs,
  playlists,
  agendas,
  allUsers,
  outputEditorUserIdsByOutputId,
  playlistEditorUserIdsByPlaylistId,
  agendaEditorUserIdsByAgendaId,
  outputPlaylistById = {},
  agendaOutputIdsByAgendaId = {},
}: {
  outputs: BroadcastOutputRecord[];
  playlists: BroadcastPlaylistRecord[];
  agendas: BroadcastAgendaRecord[];
  allUsers: AssignableUser[];
  outputEditorUserIdsByOutputId: Record<string, string[]>;
  playlistEditorUserIdsByPlaylistId: Record<string, string[]>;
  agendaEditorUserIdsByAgendaId: Record<string, string[]>;
  // playlist que a camada de vídeo de cada tela toca (resolveOutputPlaylistIds) e agendas
  // vinculadas por tela (invertido de agendaOutputIdsByAgendaId) — usados só pra rotular o alcance
  // do atalho de delegação.
  outputPlaylistById?: Record<string, string | null>;
  agendaOutputIdsByAgendaId?: Record<string, string[]>;
}) {
  const playlistNameById = useMemo(
    () => Object.fromEntries(playlists.map((playlist) => [playlist.id, playlist.name])),
    [playlists],
  );

  const linkedAgendaCountByOutputId = useMemo(() => {
    const count: Record<string, number> = {};
    for (const outputIds of Object.values(agendaOutputIdsByAgendaId)) {
      for (const outputId of outputIds) count[outputId] = (count[outputId] ?? 0) + 1;
    }
    return count;
  }, [agendaOutputIdsByAgendaId]);

  // Playlists / agendas que não são de nenhuma tela — só essas precisam do ajuste fino avulso.
  // Playlist dedicada (ownerOutputId) já é coberta pelo atalho da sua tela.
  const standalonePlaylists = playlists.filter((playlist) => !playlist.ownerOutputId);
  const linkedAgendaIds = new Set(
    Object.entries(agendaOutputIdsByAgendaId)
      .filter(([, outputIds]) => outputIds.length > 0)
      .map(([agendaId]) => agendaId),
  );
  const standaloneAgendas = agendas.filter((agenda) => !linkedAgendaIds.has(agenda.id));

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        Um Admin do Estúdio (permissão <code className="text-xs">broadcast.manage</code>) delega aqui. A pessoa só ganha acesso de
        fato depois de também ter o papel correspondente em Papéis e Permissões.
      </p>

      <section className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Tv className="size-4" aria-hidden="true" /> Por tela
        </h3>
        {outputs.length === 0 ? (
          <p className="text-xs text-muted-foreground">Nenhuma tela cadastrada ainda.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 lg:grid-cols-2">
            {outputs.map((output) => (
              <ScreenDelegationCard
                key={output.id}
                output={output}
                delegatedUserIds={outputEditorUserIdsByOutputId[output.id] ?? []}
                playlistName={
                  outputPlaylistById[output.id] ? playlistNameById[outputPlaylistById[output.id] as string] ?? null : null
                }
                linkedAgendaCount={linkedAgendaCountByOutputId[output.id] ?? 0}
                assignableUsers={allUsers}
              />
            ))}
          </div>
        )}
      </section>

      <details className="rounded-panel border border-border/60 bg-muted/10 p-3">
        <summary className="cursor-pointer text-sm font-medium text-foreground">Ajuste fino (por recurso)</summary>
        <div className="mt-3 space-y-6">
          <p className="text-xs text-muted-foreground">
            Use só pra casos pontuais — ex: uma agenda que não está vinculada a nenhuma tela, ou tirar o acesso de alguém a um
            recurso específico sem mexer no resto da tela.
          </p>

          <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-medium text-foreground">
              <Tv className="size-4" aria-hidden="true" /> Telas
            </h4>
            {outputs.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma tela cadastrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {outputs.map((output) => (
                  <ResourceEditorsRow
                    key={output.id}
                    kind="output"
                    resourceId={output.id}
                    name={output.name}
                    allUsers={allUsers}
                    selectedUserIds={outputEditorUserIdsByOutputId[output.id] ?? []}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-medium text-foreground">
              <ListVideo className="size-4" aria-hidden="true" /> Playlists sem tela dona
            </h4>
            {standalonePlaylists.length === 0 ? (
              <p className="text-xs text-muted-foreground">Toda playlist é dedicada a uma tela — nada avulso aqui.</p>
            ) : (
              <div className="space-y-2">
                {standalonePlaylists.map((playlist) => (
                  <ResourceEditorsRow
                    key={playlist.id}
                    kind="playlist"
                    resourceId={playlist.id}
                    name={playlist.name}
                    allUsers={allUsers}
                    selectedUserIds={playlistEditorUserIdsByPlaylistId[playlist.id] ?? []}
                  />
                ))}
              </div>
            )}
          </section>

          <section className="space-y-2">
            <h4 className="flex items-center gap-2 text-xs font-medium text-foreground">
              <CalendarDays className="size-4" aria-hidden="true" /> Agendas
            </h4>
            {agendas.length === 0 ? (
              <p className="text-xs text-muted-foreground">Nenhuma agenda cadastrada ainda.</p>
            ) : (
              <div className="space-y-2">
                {agendas.map((agenda) => (
                  <ResourceEditorsRow
                    key={agenda.id}
                    kind="agenda"
                    resourceId={agenda.id}
                    name={standaloneAgendas.some((a) => a.id === agenda.id) ? `${agenda.name} (sem tela)` : agenda.name}
                    allUsers={allUsers}
                    selectedUserIds={agendaEditorUserIdsByAgendaId[agenda.id] ?? []}
                  />
                ))}
              </div>
            )}
          </section>
        </div>
      </details>
    </div>
  );
}
