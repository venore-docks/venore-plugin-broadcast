"use client";

import { type ReactNode } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@venore/plugin-sdk/ui";
import { useUrlParam } from "./master-detail";
import { STATUS_BORDER_CLASSNAME, StatusDot } from "./status-dot";
import type { StatusTone } from "./status";

export type AdminTab = {
  key: string;
  label: string;
  icon: ReactNode;
  description: string;
  view: ReactNode;
  // Só as três áreas do pedido (Telas/Playlists/Agenda) carregam status — Configurações e
  // Administradores não têm um "pronto/precisa de atenção" que faça sentido, então ficam de fora
  // do grid de cards mas continuam navegáveis pela TabsList normal, abaixo.
  status?: { tone: StatusTone; label: string };
  itemCount?: number;
};

function OverviewCard({ tab, active, onSelect }: { tab: AdminTab; active: boolean; onSelect: () => void }) {
  if (!tab.status) return null;
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active}
      className={`flex flex-col gap-2 rounded-panel border border-l-4 border-border bg-card p-4 text-left ui-motion-base hover:border-ring ${STATUS_BORDER_CLASSNAME[tab.status.tone]} ${active ? "ring-2 ring-ring" : ""}`}
    >
      <span className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-sm font-medium text-foreground">
          {tab.icon}
          {tab.label}
        </span>
        {tab.itemCount != null && <span className="text-2xl font-semibold tabular-nums text-foreground">{tab.itemCount}</span>}
      </span>
      <span className="flex items-center gap-1.5">
        <StatusDot tone={tab.status.tone} />
        <span className="text-xs text-muted-foreground">{tab.status.label}</span>
      </span>
    </button>
  );
}

// Painel de entrada da página: cards grandes e coloridos por área (pedido explícito: "identifique
// as áreas de Telas, Agenda e Playlist" + "indicações luminosas e coloridas") acima da mesma Tabs
// que já existia — clicar num card ou numa aba faz a mesma coisa (estado controlado único), então
// os cards são só um atalho maior/mais visual pra a mesma navegação, não um mecanismo paralelo.
export function AdminOverviewNav({ tabs }: { tabs: AdminTab[] }) {
  // Aba ativa na URL (?aba=<key>) — deep-link + o atalho "Playlists em uso" do Dashboard consegue
  // pular pra Telas › tela X. Cai na primeira aba quando o valor não bate com nenhuma (ex: link
  // pra uma aba que este ator não vê).
  const [rawValue, setRawValue] = useUrlParam("aba", tabs[0].key);
  const value = tabs.some((tab) => tab.key === rawValue) ? (rawValue as string) : tabs[0].key;
  const setValue = (next: string) => setRawValue(next);
  const overviewTabs = tabs.filter((tab) => tab.status);

  return (
    <div className="space-y-4">
      {overviewTabs.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {overviewTabs.map((tab) => (
            <OverviewCard key={tab.key} tab={tab} active={value === tab.key} onSelect={() => setValue(tab.key)} />
          ))}
        </div>
      )}

      <Tabs value={value} onValueChange={setValue}>
        <div className="overflow-x-auto">
          <TabsList className="w-fit">
            {tabs.map((tab) => (
              <TabsTrigger key={tab.key} value={tab.key} className="shrink-0">
                {tab.icon} {tab.label}
                {tab.status && <StatusDot tone={tab.status.tone} className="ml-0.5" />}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {tabs.map((tab) => (
          <TabsContent key={tab.key} value={tab.key} className="space-y-3">
            {tab.description && <p className="text-sm text-muted-foreground">{tab.description}</p>}
            {tab.view}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
