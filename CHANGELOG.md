# Changelog

Todas as mudanças notáveis do Broadcast Studio (`@venore/plugin-broadcast`), por versão. Formato
livre — este arquivo é pra alguém entender rápido "o que mudou de X pra Y" sem entrar no `git log`;
as tags no GitHub continuam sendo a fonte exata de cada release.

## v1.9.5

- Rate limit nos endpoints públicos por token (sync-advance, output-state, beacon, diagnósticos).
- Indicador de idade do link da TV no admin ("Link gerado há N dias", aviso a partir de 180 dias)
  — sem rotação automática (risco de derrubar uma TV kiosk sem aviso).

## v1.9.4

- Preview de alerta/comunicado de urgência antes de publicar (mini-réplica visual do que vai pra
  TV, com confirmação).
- Busca por grupo na lista de telas (a mesma caixa de busca já existente passa a casar pelo nome
  do grupo também).

## v1.9.3

- Cursor de reprodução sincronizada não salta mais pro item 0 quando o item atual some da playlist
  em edição — reancora na mesma posição ordinal.
- Teste de integração cobrindo duas saídas de fato sincronizando (cursor compartilhado real, não
  mockado).

## v1.9.2

- Integridade de arquivo local: tamanho + hash sha256 gravados no momento em que um vídeo/imagem
  local é publicado, verificação sob demanda contra substituição de arquivo, e "aceitar arquivo
  atual" pra falsos positivos legítimos.
- Fecha um gap do fluxo de aprovação (v1.9.0): upload direto de vídeo também passa a ser gateado.

## v1.9.1

- Fonte da layer "news" trocada de uma API externa genérica pro feed sincronizado de outras
  plataformas Venore Docks (`@venore/plugin-sdk/content-feed`) — nenhuma chamada à internet sai
  mais do plugin. Camada de clima mantida como está.
- Notificação in-app (toast + faixa persistente) quando uma tela fica desconectada por mais de 5
  minutos.

## v1.9.0

- Fila de aprovação + log de auditoria de conteúdo: mudanças de playlist/alerta/takeover feitas
  por um responsável escopado (sem `broadcast.manage`) ficam pendentes até um administrador
  aprovar; toda mudança — inclusive as aplicadas na hora — fica registrada.

## v1.8.4

- Reprodução sincronizada entre telas passa a ser sempre automática quando tocam a mesma playlist,
  independente de grupo (antes exigia marcar o grupo como "sincronizado").

## v1.8.0 – v1.8.3

- Reprodução sincronizada por grupo (abordagem inicial, depois generalizada em v1.8.4).
- Aviso rápido e comunicado de urgência por grupo/tela específica (antes só "todas as telas").
- Cor livre por card de tela, grupos de telas com ações em lote.
- Diversos ajustes de layout do admin e correções de sincronização/reversão de formulário.

## v1.7.0

- Redesenho do admin: Telas, Playlists e Agendas viram master-detail (lista + detalhe com abas) no
  lugar do grid de cards antigo. Fim da aba "Playlists" própria — a playlist de cada tela é editada
  dentro do detalhe da tela.

## v1.6.0 – v1.6.1

- Expansão grande: dayparting (horário de funcionamento), upload de vídeo, delegação de
  responsáveis, telemetria, templates de tela, fallback de conteúdo, congelar tela, comunicado de
  urgência (takeover), grupos de telas, import CSV de agenda, onboarding, proof-of-play.
- Correção: playlist de item único não dava loop no vídeo.

## v1.0.0 – v1.5.0

- Primeiras fases do plugin: migração pra `@venore/plugin-sdk`, diagnóstico de telas (browser +
  agent PowerShell), import/export de pacote único, dashboard com aviso rápido, ajustes de
  playlist (página web / notícias / imagens da pasta).
