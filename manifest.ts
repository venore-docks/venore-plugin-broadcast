import type { PluginManifest } from "@venore/plugin-sdk";
import { BROADCAST_SETTINGS } from "./shared/settings";

// Faixa escrita à mão, não importada de platform/plugin-engine/core-version.ts — mesmo motivo do
// birthdaysManifest (src/plugins/birthdays/manifest.ts): importar o CORE_VERSION corrente
// tornaria a checagem de compatibilidade sempre trivialmente satisfeita.
//
// HOSPEDAGEM: este plugin exige rodar num único processo Node de longa duração (servidor local),
// NÃO serverless / multi-instância. O barramento de eventos das saídas (SSE ao vivo) é um pub/sub
// em memória guardado em globalThis (ver runtime/output-bus.ts) — dividido entre várias
// instâncias, um evento publicado numa não chega nas TVs conectadas às outras. Trocar por Redis
// pub/sub (ou equivalente) é pré-requisito pra qualquer deploy horizontalmente escalado.
export const broadcastManifest: PluginManifest = {
  manifestVersion: "1.0.0",
  key: "broadcast",
  name: "Broadcast Studio",
  version: "1.8.0",
  description:
    "Composição de cenas em camadas (vídeo de playlist + overlays HTML5) com saída para exibição em TV, tipo um switcher OBS simplificado.",
  compatibility: { coreVersion: ">=2.0.0 <3.0.0" },
  // Dependência OPCIONAL de company-metrics (docs/metricas-internas-plugin.md §9.3): quando esse
  // plugin está instalado, a tela de playlist ganha um atalho "Painel de métricas" que evita
  // colar a URL da TV à mão. Sem ele, o atalho some da UI e o operador continua usando o item
  // "webpage" com a URL /company-metrics/tv/{token}. broadcast NUNCA depende de company-metrics
  // pra funcionar — por isso `type: "optional"` + isPluginActive em runtime.
  dependencies: [{ pluginKey: "company-metrics", type: "optional" }],
  // Schema próprio do plugin — aplicado no install (run-plugin-migrations.ts), não no
  // vercel-build. Default de migrationsSchema ("broadcast_migrations") já bate com
  // src/plugins/broadcast/drizzle.config.ts.
  migrationsPath: "./migrations",
  // Configurar broadcast.rootFolder passa por setSetting (@/contexts/settings), gateado por
  // settings.manage — mesmo padrão de birthdays' BIRTHDAY_APPEARANCE_SETTINGS (appearance/
  // actions.ts): nenhuma permission própria de "gerenciar settings do plugin" existe hoje, o
  // catálogo central já cobre isso, então declarar "broadcast.settings" aqui seria uma permission
  // nunca de fato enforced.
  permissions: [
    { key: "broadcast.manage", label: "Gerenciar playlists, saídas e controle ao vivo" },
    // Escopo estreito de propósito — pra um papel "editor de agenda"/"editor de tela" que só cuida
    // do que foi explicitamente atribuído a ele, sem acesso ao restante do Broadcast Studio.
    // Pedido explícito: "adicionar um responsável (role editor pra cima) com acesso e permissão
    // para alterar apenas a agenda atribuída, a mesma coisa para telas". A permission sozinha NÃO
    // basta — só dá acesso de fato às agendas/saídas listadas em
    // set-agenda-editors/set-output-editors (ver shared/scoped-authorization/index.ts); sem
    // nenhuma atribuição, quem só tem esta permission não edita nada. broadcast.manage continua
    // com acesso total, sem precisar de atribuição nenhuma.
    { key: "broadcast.agenda.manage", label: "Editar agendas atribuídas no Broadcast Studio (sem acesso ao restante)" },
    { key: "broadcast.outputs.manage", label: "Editar telas atribuídas no Broadcast Studio (sem acesso ao restante)" },
    // Mesmo racional das duas acima, pra playlist — paridade pedida explicitamente: "Superadmin
    // pode definir quem são os administradores de telas, playlists e agendas".
    { key: "broadcast.playlists.manage", label: "Editar playlists atribuídas no Broadcast Studio (sem acesso ao restante)" },
  ],
  settings: Object.values(BROADCAST_SETTINGS).map(({ key, defaultValue }) => ({ key, defaultValue })),
  // Um único link — pedido explícito: "não separe os links na navegação admin". As três
  // permissions do plugin levam todas pra /admin/broadcast; a página decide sozinha, a partir da
  // permission que o ator tem, se mostra o admin completo (4 abas) ou só a(s) aba(s) do que foi
  // atribuído a ele (ver page.tsx). Chegou a existir uma rota satélite por permission
  // (/admin/broadcast/agenda, /admin/broadcast/telas) — foram absorvidas nesta mesma página.
  navigation: [
    {
      key: "broadcast.admin",
      label: "Broadcast Studio",
      href: "/admin/broadcast",
      icon: "video",
      groupKey: "plugins",
      groupLabel: "Plugins",
      groupOrder: 30,
      order: 30,
      requiredPermission: ["broadcast.manage", "broadcast.agenda.manage", "broadcast.outputs.manage", "broadcast.playlists.manage"],
    },
  ],
};
