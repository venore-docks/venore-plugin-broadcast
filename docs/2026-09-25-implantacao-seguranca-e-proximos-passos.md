# Broadcast — implantação de 25/09/2026: pendências, segurança e próximos passos

Documento de passagem de sessão. Quem ler (pessoa ou agente) deve começar pela seção 1 — são
pendências operacionais que não dependem de código novo. Seções 3–5 são propostas **ainda não
implementadas**; nenhuma linha de código do plugin mudou por causa deste documento.

Contexto: plugin `@venore/plugin-broadcast`, instalado na instância `broadcast-fem` do Venore Docks
(`venore-docks/venore-docks`, branch `broadcast-fem`).

---

## 1. Pendências da consolidação da v1.9.15 (fazer primeiro)

Estado em 25/09/2026:

| O quê | Estado |
| --- | --- |
| `main` do plugin | ✅ fast-forward para `4eba7ff` (v1.9.15) |
| Tags `v1.9.10` → `v1.9.15` no GitHub | ❌ **não publicadas** — o ambiente da sessão recebeu 403 ao dar push de tag |
| `broadcast-fem` (Venore Docks) apontando `#v1.9.15` | ⏳ commit `5276113` pronto só no branch `claude/happy-edison-x9fhaq` do venore-docks; **não** foi pro `broadcast-fem` porque a tag ainda não existe |

### 1.1 Publicar as tags (neste repositório)

Cada commit abaixo tem a `version` correspondente no `package.json` (conferido):

```bash
git fetch origin
git tag -a v1.9.10 c362d10 -m v1.9.10
git tag -a v1.9.11 2082357 -m v1.9.11
git tag -a v1.9.12 dd46bf2 -m v1.9.12
git tag -a v1.9.13 ed8cea5 -m v1.9.13
git tag -a v1.9.14 fdb6493 -m v1.9.14
git tag -a v1.9.15 4eba7ff -m v1.9.15
git push origin --tags
```

Conferir: `git ls-remote --tags origin | grep v1.9.15`.

### 1.2 Atualizar o `broadcast-fem` (no repositório venore-docks)

Só depois da 1.1. O commit `5276113` troca `#4eba7ff` → `#v1.9.15` em `package.json` e na linha de
spec do `package-lock.json` (o `resolved` continua o sha completo `4eba7ff1e5c7…`, mesmo código).

```bash
git checkout broadcast-fem
git pull origin broadcast-fem
git merge --ff-only origin/claude/happy-edison-x9fhaq
npm ci   # confirma que resolve a tag
git push origin broadcast-fem
```

Se o fast-forward não for possível (alguém mexeu no `broadcast-fem` antes), refazer à mão: trocar
`#4eba7ff` por `#v1.9.15` nos dois arquivos, commit `chore(broadcast): fixa @venore/plugin-broadcast
na tag v1.9.15` (AGENTS.md §8 — commit de instância só mexe em `package.json`/`package-lock.json`).

---

## 2. Relato do teste em campo (25/09/2026)

- 3 telas no ar. Cada mini PC (Windows) serve **duas** TVs.
- **Catracas:** mini PC com Chrome — rodou perfeito.
- **Brave:** precisou clicar em play mesmo com a v1.9.15. Decisão do operador: trocar por Chrome
  nesses computadores.
- **Administrativo + Recepção (mesmo mini PC):** áudio duplicado. O Windows permite só uma saída
  (uma TV Samsung) e as duas janelas tocavam a mesma transmissão ao vivo → som dobrado/eco.
- Conteúdo hoje: tela externa vinda de `erasto-league.vercel.app` (item "Página Web") e transmissão
  ao vivo do YouTube.

---

## 3. Áudio duplicado — correção proposta

Rotear saída por janela no Windows não resolve: as duas janelas são o mesmo processo do Chrome.
"Silenciar site" na aba também não, porque o mute do Chrome é por origem e as duas telas são a
mesma origem.

### 3.1 Contorno imediato (sem código)

Abrir a Recepção como **instância separada** do Chrome, com perfil próprio e mudo:

```
chrome.exe --kiosk --user-data-dir=C:\kiosk-recepcao --mute-audio --autoplay-policy=no-user-gesture-required https://<dominio>/ext/broadcast/out/<token>
```

A tela Administrativo segue com o atalho normal (com `--autoplay-policy=no-user-gesture-required`,
sem `--mute-audio`). `--user-data-dir` diferente é o que força processo separado — sem ele a flag
`--mute-audio` é ignorada porque a janela reaproveita o processo já aberto.

### 3.2 Correção no plugin (recomendada — v1.9.16)

Interruptor **"Áudio nesta tela"** no detalhe da tela, aba Disponibilidade → seção Exibição, ligado
por padrão. Mesmo desenho do interruptor de legenda da v1.9.13 — usar como molde:

- Schema: `database/schema/index.ts` (~linha 398, ao lado de `liveStreamCaptions`) → nova coluna
  `outputs.audio_enabled boolean not null default true`. Migration via `npm run
  db:generate:broadcast` no venore-docks (nunca editar `_journal.json` à mão).
- Contrato: `contracts/types.ts` (~linha 268, ao lado de `liveStreamCaptions`).
- Use case: copiar `features/outputs/set-output-live-stream-captions/` →
  `set-output-audio-enabled/` (handler → service → store, `OperationResult`, `authorizeActor`
  igual ao original) + teste de service.
- Estado da TV: `features/outputs/get-output-state/` já entrega `liveStreamCaptions`; incluir o novo
  campo do mesmo jeito.
- TV (`components/output/output-canvas.tsx`, `LiveStreamScreen`): com áudio desligado, mandar
  `youTubePlayerCommand("mute")` (em `shared/youtube.ts`) no mesmo ponto em que a legenda é
  aplicada (quando `playing`), reaplicando no intervalo; religado → `unMute`. Não trocar o `src` do
  iframe (recarregaria a transmissão) — mesma regra da legenda.
- TV (`components/output/layer-renderer.tsx`): vídeo de playlist com "Tocar áudio na TV" e
  `WebpageSlide` com `withAudio` passam a respeitar também o interruptor da tela (áudio só se item
  **e** tela permitirem).
- Admin: interruptor ao lado do de legenda; texto de ajuda: "Desligue nas telas que dividem a mesma
  saída de som com outra tela."
- CHANGELOG + `package.json` 1.9.16.

---

## 4. Segurança — diagnóstico e propostas

### 4.1 O que já está bom (verificado no código)

- **Transmissão ao vivo:** `shared/youtube.ts` extrai e valida só o id (11 caracteres,
  `[A-Za-z0-9_-]`) de hosts do YouTube; a TV só embeda `youtube.com/embed/<id>`, nunca a URL colada.
  Iniciar/encerrar exige `broadcast.manage` (`features/live-stream/*/handler.ts`).
- **Item "Página Web":** passa por `authorizePlaylistActor` + fila de aprovação
  (`runGatedMutation`, `features/playlists/add-webpage-playlist-item/handler.ts`). O iframe
  (`components/output/layer-renderer.tsx`, `WebpageSlide`) usa `sandbox="allow-scripts
  allow-same-origin"` (sem navegação do topo, popups, downloads) e `referrerPolicy="no-referrer"`
  (o token da TV não vaza pro site embutido).
- **Endpoints públicos por token:** rate limit desde a v1.5; PIN opcional por tela
  (`routes/out/page.tsx`, `features/outputs/set-output-pin`).

### 4.2 Riscos e propostas, por prioridade

1. **URL externa totalmente aberta (maior risco).** Desde a v1.9.9, `shared/webpage-url.ts` aceita
   qualquer `http(s)://` ("desbloqueado temporariamente"). Qualquer um com permissão de playlist (e
   aprovação) põe qualquer site numa TV pública.
   **Proposta:** allowlist de hosts como setting do plugin (`shared/settings.ts`), ex:
   `["erasto-league.vercel.app"]`. Regras: rota interna `/...` continua liberada; URL absoluta só
   `https:` e só se `hostname` estiver na lista (comparação exata, minúscula, sem curinga implícito);
   `http:` rejeitado. Validar em `isValidInternalWebpageRoute` (usada pelas duas escritas — add e
   update). Revalidar também na leitura da TV (item antigo cadastrado antes da allowlist não deve
   tocar se o host saiu da lista). Tela de admin pra editar a lista (`broadcast.manage`).
2. **Bloqueio no próprio Chrome dos mini PCs (sem código, maior efeito).** Políticas de Chrome
   (GPO/registro): `URLBlocklist = ["*"]` e `URLAllowlist = [<domínio da instância>,
   "erasto-league.vercel.app", "youtube.com", "youtube-nocookie.com", "googlevideo.com",
   "ytimg.com"]`. Mesmo com um link indevido cadastrado, a TV não abre. Testar a transmissão ao
   vivo depois de aplicar — o player do YouTube busca recursos em mais de um domínio.
3. **CSP `frame-src` na página da TV.** Enviar na resposta de `/ext/broadcast/out/:token` um
   `Content-Security-Policy: frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com
   <hosts da allowlist>`. Defesa em profundidade: o navegador recusa iframe fora da lista mesmo se
   a validação da escrita falhar. Verificar onde o core permite setar header numa rota de plugin
   (dispatcher em `src/app/ext/[...slug]/` do venore-docks) antes de implementar.
4. **Token da TV curto.** `features/outputs/rotate-output-token/store.ts` usa `randomBytes(6)`
   (48 bits, 8 caracteres). Com o rate limit é difícil de adivinhar, mas é pouca margem pra um link
   que fica exposto numa TV. **Proposta:** `randomBytes(16)` para tokens novos/rotacionados; tokens
   existentes continuam válidos (não derrubar TV kiosk sem aviso — mesma decisão da v1.9.5).
5. **Operação:** PIN ligado nas três TVs; `broadcast.manage` só pra quem de fato transmite (é o que
   põe qualquer transmissão ao vivo em todas as telas); conferir o log de auditoria de conteúdo
   (v1.9) de vez em quando.
6. **Mini PCs:** usuário Windows sem admin com auto-login só no kiosk; extensões bloqueadas por
   política (`ExtensionInstallBlocklist = ["*"]`); nenhuma sessão de admin do Venore aberta
   nessas máquinas.

Observação: pra rota interna (`/...`), `allow-scripts` + `allow-same-origin` no mesmo origin anula o
sandbox (a página embutida alcança a página da TV). Hoje é aceitável porque só conteúdo do próprio
Venore Docks entra por aí — não estender isso a hosts externos "confiáveis" do mesmo domínio.

---

## 5. Outras melhorias sugeridas

- **Plano B da transmissão ao vivo:** se o player do YouTube reportar erro (evento `onError` via
  a mesma ponte de `postMessage` já usada em `LiveStreamScreen`) ou não tocar depois dos nudges de
  `playVideo` (4/8/15s), a TV volta pra playlist e o admin recebe aviso (reaproveitar a notificação
  de tela offline da v1.9.1). Hoje a TV fica parada na tela de erro do YouTube até alguém encerrar.
- **Término agendado da transmissão:** campo opcional "encerrar às HH:MM" no painel "Transmissão ao
  vivo" (padrão de agendamento já existe nos avisos recorrentes da v1.9.7).
- **Padronizar os mini PCs:** Chrome em `--kiosk` com `--autoplay-policy=no-user-gesture-required`,
  atalho na inicialização do Windows, um `--user-data-dir` por tela (resolve também o áudio, seção
  3.1). Documentar o atalho na página `routes/setup/page.tsx`, que já fala da flag de autoplay.
- **Higiene de histórico:** o commit `2cdd5e6` ("livre stream mid implementation") está na `main`
  entre a v1.9.10 e a v1.9.11 — é WIP; não precisa reescrever (a tag v1.9.11 aponta pra `2082357`),
  só evitar commits WIP direto na `main` daqui pra frente.

---

## 6. Ordem sugerida pra próxima sessão

1. Seção 1 (tags + `broadcast-fem`).
2. Aplicar o contorno 3.1 no mini PC Administrativo/Recepção.
3. Implementar 3.2 (áudio por tela, v1.9.16).
4. Implementar 4.2 item 1 (allowlist de hosts) + 4.2 item 4 (token longo) — v1.9.17.
5. Políticas de Chrome (4.2 itens 2 e 6) nos mini PCs.
6. Seção 5 conforme prioridade do operador.
