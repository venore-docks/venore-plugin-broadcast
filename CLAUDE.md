# @venore/plugin-broadcast — instruções para o Claude

Plugin do [Venore Docks](https://github.com/venore-docks/venore-docks), instalado no core como dependência git
(`@venore/plugin-broadcast`). Este repo não roda sozinho: build, lint, typecheck e testes rodam **a partir do core**.

## Regras de arquitetura

As regras são as do core — não copie para cá, leia lá quando a tarefa tocar a área:
- `AGENTS.md` do core (§1 camadas `handler → service → store`, `OperationResult<T>`; §2 padrões proibidos).
  Todo "AGENTS.md §N" citado em comentário deste repo se refere ao **AGENTS.md do core**.
- `.claude/rules/plugin-routes.md` do core: toda rota mora em `routes/route-table.ts`, nunca em `app/`.
- `.claude/rules/css-tokens.md` do core: só tokens shadcn (`bg-card`, `text-muted-foreground`…), sem cor crua.
- Contexts do core só via barrel (`@/contexts/<nome>`) ou `contracts/`; outro plugin só via barrel, com a
  dependência declarada no `manifest.ts`.
- Schema: migration gerada com `drizzle-kit generate` (`drizzle.config.ts`), nunca editar `_journal.json` à mão.

## Verificar contra o core

Com o core clonado em `../venore-docks`:

```bash
cd ../venore-docks
npm pkg set "dependencies.@venore/plugin-broadcast=file:../venore-plugin-broadcast"   # não commitar
npm install --no-audit --no-fund --loglevel=error
npm run gen:registries:strict && npm run typecheck
npm run test:plugins -- --reporter=dot   # roda ../venore-plugin-broadcast/**/*.test.ts quando o clone existe
git checkout package.json package-lock.json                                   # desfaz o file:
```

## Versão

`package.json` `version` = tag `vX.Y.Z`. Publicar = subir a versão no `package.json` e criar a tag `v<version>` no mesmo commit (`git tag vX.Y.Z && git push origin vX.Y.Z`).
O core passa a usar a versão nova com a skill `bump-plugin` do core — nunca ajuste o core para acomodar o pacote.

## Economia de tokens

- Uma sessão por tarefa; o que precisa sobreviver vai para a passagem de sessão (skill `passagem-de-sessao` do core).
- Anexe à sessão só os repos que vão mudar; para consultar o core, leia o arquivo pontual em vez de clonar tudo.
- Saída enxuta: `--reporter=dot`, `git diff --stat` antes do diff, arquivo grande por faixa.
