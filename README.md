# @venore/plugin-broadcast

**Broadcast Studio** — composição de cenas em camadas (vídeo de playlist + overlays HTML5) com
saída para exibição em TV, tipo um switcher OBS simplificado. Plugin do
[Venore Docks](../venore-claudinho/VENORE-DOCKS.md).

## O que faz

| Conceito | Papel |
| --- | --- |
| **Tela (output)** | Uma URL (`/ext/broadcast/out/:token`) que abre na TV. Acesso só por `token`; PIN opcional. |
| **Playlist** | Sequência de vídeos / imagens / páginas web / blocos de notícia / eventos de agenda. |
| **Cena / Camada** | Toda tela nasce com a cena fixa de 3 camadas (vídeo / agenda / aviso). Não se edita camada à mão. |
| **Agenda** | Agenda interna do plugin — várias agendas nomeadas (ex: Capelania, Escola), evento com recorrência semanal simples. |
| **Aviso rápido** | Lower-third que sobrepõe tudo quando ativo e expira sozinho. |

## Desenvolvimento

Este repositório é a **fonte** do pacote `@venore/plugin-broadcast`. Como os outros
`venore-plugin-*`, ele **não é buildado isolado** hoje — `typecheck`, `test` e `lint` rodam quando
o conteúdo está sincronizado no host, em `venore-claudinho/src/plugins/broadcast/`:

```bash
# no repositório do host (venore-claudinho/)
npm run typecheck
npm run test -- src/plugins/broadcast
npm run lint
```

`@venore/plugin-sdk` resolve pelo alias de `tsconfig` do host (`src/sdk`), **não** pelo npm — por
isso não aparece em `dependencies` nem `peerDependencies` (ver o comentário no `package.json`).

### Migrations

`drizzle-kit generate` roda **aqui** (`npx drizzle-kit generate`, com `DATABASE_URL` no ambiente);
a aplicação acontece no host, no install do plugin (`run-plugin-migrations.ts`, lendo
`manifest.migrationsPath`). Schema próprio (`pgSchema("broadcast")`), tabela de tracking dedicada
(`broadcast_migrations.__drizzle_migrations`) — nunca compartilha o cursor de migration do core.

## Known Gaps

Lacunas conhecidas e aceitas para o cenário-alvo (servidor local, rede local). Reavaliar antes de
qualquer deploy diferente.

1. **Processo único obrigatório.** O barramento de eventos das saídas (`runtime/output-bus.ts`,
   SSE ao vivo) e o limitador de tentativas de PIN (`runtime/pin-attempts.ts`) guardam estado em
   memória (`globalThis`), por processo. Num deploy serverless / multi-instância: eventos SSE não
   propagam para TVs conectadas a outra instância (a tela congela, só o poll de fallback segura), e
   o limitador de brute force de PIN é contornável batendo em instâncias diferentes. **Pré-requisito
   para escalar horizontalmente:** trocar os dois por Redis pub/sub (ou equivalente).

2. **Rota de streaming sem autenticação.** `GET /ext/broadcast/stream/:itemId` serve o arquivo de
   vídeo sem checar sessão nem PIN — troca deliberada para o cenário "servidor local, rede local".
   Qualquer request na rede com o `itemId` (UUID, não enumerável) baixa o vídeo. **Não** exponha a
   instância à internet sem colocar uma camada de auth na frente dessa rota. O mesmo vale, em menor
   grau, para `POST /api/broadcast/output/:token/beacon` e as demais rotas por token — nenhuma
   vaza dado, mas todas confiam só no token.

3. **Telemetria e limitadores em memória por processo.** Além do output-bus e do pin-attempts,
   agora `runtime/output-beacon.ts` (presença/telemetria das TVs) também vive em `globalThis`.
   Mesma restrição de processo único do item 1.

## Não implementado (deliberado)

- **Sincronização de relógio entre telas** (video wall / salas espelhadas — todas no mesmo frame).
  Nicho; exige mudar o modelo de reprodução do `PlaylistLayer` (posição a partir de
  `epoch % duração` em vez de `useState(0)`) e uma bancada de teste com hardware pra validar.
- **Split do `components/output/layer-renderer.tsx`** (~1.900 linhas). É refactor puro, sem valor
  pro usuário, e arriscado sem `tsc`/testes rodando — melhor fazer com o loop de verificação ativo.
- **Notificação ativa "TV caiu"** (push/e-mail). Precisa de um job no servidor comparando
  "estava conectada, sumiu"; o plugin roda num processo só, sem scheduler. O admin já mostra o
  estado ao vivo enquanto está aberto (telemetria + IPs conectados).
