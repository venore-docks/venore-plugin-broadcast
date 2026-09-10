"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Input } from "@venore/plugin-sdk/ui";
import { StatusDot } from "./status-dot";
import type { StatusInfo } from "./status";

// Casca master–detail compartilhada por Telas e Agendas (antes: grid de cards gigantes, tudo
// aberto de uma vez). Esquerda = lista com busca + grupos recolhíveis + bolinha de status;
// direita = o item selecionado (o chamador decide o conteúdo, normalmente uma <Tabs>). A seleção
// vai pra URL (?<'paramKey'>=<id>) via history.replaceState — sem navegação/refetch, só pra
// refresh e "manda o link da tela X" funcionarem. Responsivo: lado a lado em lg+; abaixo, a lista
// é a tela e escolher um item empurra o detalhe com um "voltar".

export type MasterDetailEntry = {
  id: string;
  name: string;
  status: StatusInfo;
  // null = sem grupo (cai num bloco "Sem grupo" no fim da lista).
  groupKey: string | null;
  groupLabel: string | null;
  // Indicador pequeno à direita da linha (ex: "2 TVs", "em 3 telas").
  badge?: ReactNode;
  // Cor livre do item (hex) — vira uma faixa fina na borda esquerda da linha. NÃO substitui a
  // bolinha de status (essa continua sendo o sinal de "precisa de atenção").
  accentColor?: string | null;
  // Flutua a linha pro topo do grupo e marca visualmente — pro operador achar o que precisa de
  // atenção sem procurar.
  attention?: boolean;
};

const NO_GROUP = "__no-group__";

// Lê um parâmetro da querystring e escreve via history.replaceState — sem navegação/refetch, só
// pra refresh e "manda o link da tela X" funcionarem. Exportado porque o detalhe (abas de Telas/
// Agendas) e o nav de cima (admin-overview-nav.tsx) usam o mesmo mecanismo.
export function useUrlParam(key: string, fallback: string | null): [string | null, (next: string | null) => void] {
  // Começa SEMPRE no fallback — o mesmo valor no SSR e na 1ª renderização do client, senão dá
  // hydration mismatch (o server não conhece a querystring). O deep-link é lido no efeito abaixo,
  // depois da hidratação (um flash de 1 frame só quando a URL já vem com o parâmetro).
  const [value, setValue] = useState<string | null>(fallback);

  useEffect(() => {
    const fromUrl = new URLSearchParams(window.location.search).get(key);
    setValue((current) => (fromUrl && fromUrl !== current ? fromUrl : current));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const set = useCallback(
    (next: string | null) => {
      setValue(next);
      if (typeof window === "undefined") return;
      const params = new URLSearchParams(window.location.search);
      if (next) params.set(key, next);
      else params.delete(key);
      const qs = params.toString();
      // 1º arg = history.state ATUAL, não null: o App Router do Next guarda a árvore de rota em
      // window.history.state. Passar null aqui apagava esse estado e o router entrava em loop de
      // re-render (re-executando os server components e disparando os efeitos de novo).
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
      );
    },
    [key],
  );

  return [value, set];
}

export function MasterDetail({
  paramKey,
  entries,
  renderDetail,
  searchPlaceholder = "Buscar…",
  toolbar,
  emptyState,
}: {
  paramKey: string;
  entries: MasterDetailEntry[];
  renderDetail: (id: string) => ReactNode;
  searchPlaceholder?: string;
  // Acima da lista — normalmente o "+ Novo…" e menus da área toda (ex: "Grupos ▾").
  toolbar?: ReactNode;
  emptyState?: ReactNode;
}) {
  const [selectedId, setSelectedId] = useUrlParam(paramKey, entries[0]?.id ?? null);
  const [query, setQuery] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [mobileDetail, setMobileDetail] = useState(false);

  const effectiveId = entries.some((entry) => entry.id === selectedId) ? selectedId : (entries[0]?.id ?? null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const list = needle ? entries.filter((entry) => entry.name.toLowerCase().includes(needle)) : entries;
    return [...list].sort((a, b) => {
      if (Boolean(a.attention) !== Boolean(b.attention)) return a.attention ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
  }, [entries, query]);

  const groups = useMemo(() => {
    const byKey = new Map<string, { label: string; entries: MasterDetailEntry[] }>();
    for (const entry of filtered) {
      const key = entry.groupKey ?? NO_GROUP;
      const label = entry.groupKey ? (entry.groupLabel ?? entry.groupKey) : "Sem grupo";
      if (!byKey.has(key)) byKey.set(key, { label, entries: [] });
      byKey.get(key)!.entries.push(entry);
    }
    // Grupos de verdade em ordem alfabética; "Sem grupo" sempre por último.
    return [...byKey.entries()].sort((a, b) => {
      if (a[0] === NO_GROUP) return 1;
      if (b[0] === NO_GROUP) return -1;
      return a[1].label.localeCompare(b[1].label);
    });
  }, [filtered]);

  const showGroupHeaders = groups.length > 1 || (groups.length === 1 && groups[0][0] !== NO_GROUP);

  function pick(id: string) {
    setSelectedId(id);
    setMobileDetail(true);
  }

  if (entries.length === 0) {
    // A toolbar (onde mora o "+ Novo…") TEM que aparecer aqui — senão, sem nenhum item, não há
    // como criar o primeiro.
    return (
      <div className="space-y-3 lg:max-w-sm">
        {toolbar}
        {emptyState ?? <p className="text-sm text-muted-foreground">Nada por aqui ainda.</p>}
      </div>
    );
  }

  const list = (
    <div className="flex flex-col gap-2">
      {toolbar}
      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 pl-8 text-xs"
        />
      </div>
      <div className="overflow-hidden rounded-panel border border-border">
        {filtered.length === 0 && <p className="p-3 text-xs text-muted-foreground">Nenhum resultado para “{query}”.</p>}
        {groups.map(([groupKey, group]) => {
          const collapsed = collapsedGroups.has(groupKey);
          return (
            <div key={groupKey} className="border-b border-border/60 last:border-b-0">
              {showGroupHeaders && (
                <button
                  type="button"
                  onClick={() =>
                    setCollapsedGroups((current) => {
                      const next = new Set(current);
                      if (next.has(groupKey)) next.delete(groupKey);
                      else next.add(groupKey);
                      return next;
                    })
                  }
                  className="flex w-full items-center gap-1.5 bg-muted/40 px-2.5 py-1.5 text-left text-xs font-medium text-muted-foreground ui-motion-base hover:text-foreground"
                >
                  {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronDown className="size-3.5" />}
                  {group.label}
                  <span className="ml-auto tabular-nums">{group.entries.length}</span>
                </button>
              )}
              {!collapsed &&
                group.entries.map((entry) => {
                  const active = entry.id === effectiveId;
                  return (
                    <button
                      key={entry.id}
                      type="button"
                      onClick={() => pick(entry.id)}
                      aria-current={active}
                      style={entry.accentColor ? { borderLeftColor: entry.accentColor } : undefined}
                      className={`flex w-full items-center gap-2 border-t border-border/40 px-2.5 py-2 text-left ui-motion-base first:border-t-0 ${
                        entry.accentColor ? "border-l-4" : ""
                      } ${active ? "bg-accent/12" : "hover:bg-accent/6"}`}
                    >
                      <StatusDot tone={entry.status.tone} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-foreground">{entry.name}</span>
                        <span className="block truncate text-xs text-muted-foreground">{entry.status.label}</span>
                      </span>
                      {entry.badge}
                    </button>
                  );
                })}
            </div>
          );
        })}
      </div>
    </div>
  );

  const detail = effectiveId ? (
    <div className="min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setMobileDetail(false)}
        className="mb-3 flex items-center gap-1 text-xs font-medium text-muted-foreground ui-motion-base hover:text-foreground lg:hidden"
      >
        <ChevronLeft className="size-4" />
        Voltar para a lista
      </button>
      {renderDetail(effectiveId)}
    </div>
  ) : null;

  return (
    <div className="lg:flex lg:items-start lg:gap-5">
      <div className={`lg:w-72 lg:shrink-0 ${mobileDetail ? "hidden lg:block" : "block"}`}>{list}</div>
      <div className={`${mobileDetail ? "block" : "hidden lg:block"} lg:min-w-0 lg:flex-1`}>{detail}</div>
    </div>
  );
}
