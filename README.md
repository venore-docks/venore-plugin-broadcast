# @venore/plugin-broadcast

**Broadcast Studio** — gerencia o que aparece nas TVs e telas da instituição: playlists de vídeo, imagem,
página web e notícias, agenda de eventos, avisos, takeover e transmissão ao vivo. Funciona como um switcher
OBS simplificado, com saída por URL. Plugin do [Venore Docks](https://github.com/venore-docks/venore-docks).
Histórico de mudanças em [CHANGELOG.md](CHANGELOG.md).

## O que faz

| Conceito | Papel |
| --- | --- |
| **Tela (output)** | Uma URL (`/ext/broadcast/out/:token`) que abre na TV. Acesso por `token`; PIN opcional. |
| **Playlist** | Sequência de vídeos / imagens / páginas web / notícias / eventos de agenda / quadro de métricas. Playlist só de imagens toca como slideshow (movimento e transição configuráveis por playlist). |
| **Cena / Camada** | Toda tela nasce com a cena fixa de 3 camadas (vídeo / agenda / aviso). Não se edita camada à mão. |
| **Agenda** | Várias agendas nomeadas, evento com recorrência semanal, importação por CSV. Pode ser ligada a um setor do plugin Calendários (dependência opcional). |
| **Aviso rápido** | Faixa que sobrepõe o conteúdo e expira sozinha; manual ou agendado/recorrente, com preview antes de publicar. |
| **Takeover** | Conteúdo em tela cheia que substitui tudo temporariamente. |
| **Transmissão ao vivo** | Embed de transmissão do YouTube, com legenda opcional por tela. |
| **Grupo de telas** | Telas do mesmo grupo reproduzem sincronizadas; o admin mostra o drift entre elas. |

Também há horário de funcionamento, congelar/recarregar/colocar offline, ações em massa, duplicar tela,
exportar/importar pacote (inclusive de uma tela só), rodapé, ticker, gaveta e fallback por tela.

## Governança de conteúdo

- **Fila de aprovação:** quem só tem permissão escopada propõe a mudança (itens de playlist, alertas, takeover,
  upload de vídeo) e ela fica pendente até alguém com `broadcast.manage` aprovar ou rejeitar (com motivo).
- **Log de auditoria:** tabela `broadcast_content_changes` — fila e log na mesma linha (quem, quando, antes/depois).
- **Integridade de vídeo:** tamanho + sha256 gravados na aprovação; verificação sob demanda detecta arquivo trocado.
- **Notícias** vêm só do feed/blog das plataformas Venore Docks (`@venore/plugin-sdk/content-feed`).
- **Rate limit** nos endpoints públicos por token; bloqueio de tentativas de PIN.
- **Diagnóstico:** telemetria e IPs das TVs, estatísticas de reprodução, aviso in-app (toast + faixa) para tela
  offline há mais de 5 minutos.

## Permissões

| Permissão | Acesso |
| --- | --- |
| `broadcast.manage` | Total, inclusive aprovar mudanças e ver o log. |
| `broadcast.outputs.manage` | Só as telas atribuídas ao usuário. |
| `broadcast.playlists.manage` | Só as playlists atribuídas (mudanças passam por aprovação). |
| `broadcast.agenda.manage` | Só as agendas atribuídas. |

## Desenvolvimento

Este repositório é a **fonte** do pacote `@venore/plugin-broadcast`. Ele **não é buildado isolado**: build,
lint, typecheck e testes rodam a partir do core ([venore-docks](https://github.com/venore-docks/venore-docks)),
onde o plugin entra como dependência git. As regras de arquitetura, a verificação contra o core e o processo de
versão estão em [CLAUDE.md](CLAUDE.md). Resumo da verificação, com o core clonado em `../venore-docks`:

```bash
cd ../venore-docks
npm pkg set "dependencies.@venore/plugin-broadcast=file:../venore-plugin-broadcast"   # não commitar
npm install --no-audit --no-fund --loglevel=error
npm run gen:registries:strict && npm run typecheck
npm run test:plugins -- --reporter=dot
git checkout package.json package-lock.json                                          # desfaz o file:
```

`@venore/plugin-sdk` resolve pelo alias de `tsconfig` do core (`src/sdk`), **não** pelo npm — por isso não
aparece em `dependencies` nem `peerDependencies`.

**Versão:** `package.json` `version` = tag `vX.Y.Z`. O core passa a usar a versão nova com a skill `bump-plugin`.

### Migrations

`drizzle-kit generate` roda **aqui** (`npx drizzle-kit generate`, com `DATABASE_URL` no ambiente); a aplicação
acontece no host, no install do plugin (`run-plugin-migrations.ts`, lendo `manifest.migrationsPath`). Schema
próprio (`pgSchema("broadcast")`), tabela de tracking dedicada (`broadcast_migrations.__drizzle_migrations`) —
nunca compartilha o cursor de migration do core.

## Known Gaps

Lacunas conhecidas e aceitas para o cenário-alvo (servidor local, rede local, instância única). Reavaliar
antes de qualquer deploy diferente.

1. **Processo único obrigatório.** O barramento SSE das saídas (`runtime/output-bus.ts`), o cursor de
   sincronização (`runtime/sync-cursor.ts`), a telemetria (`runtime/output-beacon.ts`), o limitador de PIN
   (`runtime/pin-attempts.ts`), o rate limit (`runtime/rate-limit.ts`) e o `diagnostics-bus.ts` guardam estado
   em memória (`globalThis`), por processo. Em deploy multi-instância: eventos SSE não propagam entre
   instâncias, telas do grupo perdem a sincronia e os limitadores ficam contornáveis. **Pré-requisito para
   escalar horizontalmente:** trocar esses módulos por Redis (ou equivalente). Adiado por decisão: o deploy
   atual é instância única.

2. **Rota de streaming sem autenticação.** `GET /ext/broadcast/stream/:itemId` serve o arquivo de vídeo sem
   checar sessão nem PIN — troca deliberada para o cenário "servidor local, rede local". Qualquer request na
   rede com o `itemId` (UUID, não enumerável) baixa o vídeo. **Não** exponha a instância à internet sem uma
   camada de auth nessa rota. O mesmo vale, em menor grau, para as rotas por token (beacon, state, sync).

3. **Vídeo só em disco local.** Imagens da playlist poderiam vir de blob/CDN; vídeo continua em
   `public/broadcast/videos` por decisão.

## Não implementado (deliberado)

- **Notificação por e-mail/push** de "TV caiu". O aviso é só in-app (toast + faixa enquanto o admin está aberto).
- **Validação de vídeo por duração** — exigiria ffprobe/ffmpeg (binário nativo novo); a integridade usa tamanho + sha256.
- **Movimento de slideshow por item** — o estilo é por playlist.
- **Split do `components/output/layer-renderer.tsx`** (~1.900 linhas): refactor puro, melhor feito com o loop de
  verificação (typecheck + testes) ativo.
- **Rotação automática do token de saída** — o admin só mostra a idade do link (sugere trocar após 180 dias);
  não há como empurrar uma URL nova para as TVs.
