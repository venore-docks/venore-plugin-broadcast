# Changelog

Todas as mudanças notáveis do Broadcast Studio (`@venore/plugin-broadcast`), por versão. Formato
livre — este arquivo é pra alguém entender rápido "o que mudou de X pra Y" sem entrar no `git log`;
as tags no GitHub continuam sendo a fonte exata de cada release.

## v1.9.15

- Transmissão ao vivo: autoplay voltou a falhar no Brave depois da v1.9.12 (comandos de legenda
  mandados ao player logo após o load, antes do vídeo começar). Agora a TV faz o handshake da
  IFrame API, só mexe na legenda quando o player avisa que está tocando, e manda `playVideo` se ele
  não tiver começado em 4/8/15s.

## v1.9.14

- Texto do painel "Transmissão ao vivo" corrigido: a opção de legenda fica em Telas → aba
  Disponibilidade (seção Exibição), não numa aba "Exibição".

## v1.9.13

- Legenda da transmissão ao vivo escolhida por tela: novo interruptor "Legenda na transmissão ao
  vivo" no detalhe da tela (aba Disponibilidade, seção Exibição), desligado por padrão. Ligado, a TV força a legenda do
  YouTube (preferência português); desligado, continua desligando à força (v1.9.12). Trocar a opção
  vale na hora, sem recarregar a transmissão. Só aparece legenda se o vídeo/transmissão tiver uma.
- Migration `0019_live_stream_captions` (`outputs.live_stream_captions`, default false).

## v1.9.12

- Transmissão ao vivo: legenda desligada na TV. O embed passa a habilitar a JS API do YouTube e a
  view da TV manda `unloadModule("captions")` ao player (logo após carregar e a cada 30s, porque o
  player religa sozinho). `cc_load_policy=0` sozinho não resolvia — o YouTube só honra o valor 1.

## v1.9.11

- Transmissão ao vivo do YouTube (Dashboard → "Transmissão ao vivo"): cola o link da transmissão
  (`youtube.com/watch?v=…`, `youtube.com/live/…`, `youtu.be/…`), marca as telas (atalhos "Todas" e
  por grupo) e ela entra no lugar da playlist, em tela cheia e com som, até alguém tirar — por tela
  (× no chip) ou em todas ("Encerrar em todas"). Cada TV consome o YouTube direto pelo embed; o
  servidor só valida o link e entrega o id do vídeo. Vence o modo espera e o horário de
  funcionamento; só o comunicado de urgência passa por cima (e a transmissão volta sozinha quando ele
  expira). Link de canal (`@canal/live`) é recusado com explicação, e vídeo privado/removido ou com
  incorporação desativada é barrado antes de ir pras telas (consulta oEmbed, best-effort).
- Som exige o navegador da TV com `--autoplay-policy=no-user-gesture-required`, igual aos vídeos
  "Tocar áudio na TV".
- Migration `0018_live_streams` (tabela `broadcast.live_streams` + `outputs.live_stream_id`).

## v1.9.10

- Aba "Playlists" reaberta para quem tem `broadcast.manage` (acesso pleno) — desde a v1.7 ela só
  existia pra um responsável escopado (`broadcast.playlists.manage` sem `broadcast.manage`), e a
  playlist própria de cada tela passou a ser editada dentro do detalhe dela (aba Conteúdo). Isso
  deixava sem edição possível qualquer playlist compartilhada (tocada por mais de uma tela) ou
  recém-criada: criar/duplicar/apagar playlist só existiam dentro dessa aba, que o admin pleno
  nunca via. Agora ela volta a aparecer pra ele também, como biblioteca completa de playlists.
- Aba Conteúdo de uma tela: quando ela toca uma playlist que não é a sua própria (compartilhada ou
  de outra tela), o card ganhou um link "Editar os itens em Playlists" direto pro card certo (rola
  e destaca na grade) — antes, uma playlist genuinamente compartilhada não tinha link nenhum pra
  editar os itens dali.

## v1.9.9

- Item de playlist "Página Web": restrição a rota interna do domínio desbloqueada temporariamente
  — URL http(s) absoluta volta a ser aceita, pra permitir transmitir a tela de outra instância
  Venore Docks. Reversível (ver comentário em `shared/webpage-url.ts`).

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
