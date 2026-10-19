---
name: trigger-dev
description: Criar, editar e deployar tasks de background (Trigger.dev v4) da Vertho App. Use quando o trabalho envolver arquivos em trigger/, jobs assíncronos/de fundo, ou trabalho pós-response pesado que precisa de retry/status. Encodes que tasks NÃO sobem no git push (deploy manual), o gotcha do path com espaço quebra o CLI, e a decisão after() vs task+status.
---

# Trigger.dev (Vertho App)

Jobs de fundo rodam em **Trigger.dev v4** (`@trigger.dev/sdk` + `@trigger.dev/build`, ambos pinados em **4.7.3**). Tasks vivem em **`trigger/`** (ex.: `acumulada-piloto.ts`, `gerar-kit.ts`, `gerar-video-modulo.ts`, `render-video.ts`, `render-chunk.ts`, `extracao-video.ts`, `estruturar-material.ts`).

Shape padrão de uma task:

```ts
import { task } from '@trigger.dev/sdk';

export const minhaTask = task({
  id: 'minha-task',
  retry: { max: 3, factor: 2, minTimeout: 5_000 },
  run: async (payload: MeuPayload) => {
    // ...
  },
});
```

## Decisão: `after()` vs task Trigger

- Trabalho leve pós-response numa rota → **`after()`** (`next/server`).
- Trabalho **pesado** ou que precisa de **retry/status rastreável** → **task Trigger.dev** + coluna de status na tabela + gate/polling no client. `after()` fica só como fallback/self-heal (ex.: `trigger/acumulada-piloto.ts`).

## ⚠️ Deploy: tasks NÃO sobem no `git push`

`git push origin master` deploya só a **Vercel**. Tasks em `trigger/` precisam de **deploy manual** — sem ele, os callers fazem *graceful-error* (a task fica ausente em produção).

### Gotcha do PATH COM ESPAÇO (crítico)

O repo está em `C:\GAS\Vertho App` (espaço). O builder remoto do Trigger transforma o espaço em `Vertho%20App` → **"Cannot find module '.../trigger.config.mjs'"**. `--force-local-build` exigiria Docker (indisponível nesta máquina).

**Solução**: deployar o **COMMIT** (não o disco) a partir de um **path sem espaço**.

🔴 **Nunca copie o disco (`robocopy` de `C:\GAS\Vertho App\nextjs-app`).** O checkout principal fica
atrás do master (19/10/2026: mais de 100 commits) e tem trabalho não commitado de outras sessões; a
cópia subiria código velho, ou pela metade, para TODAS as tasks. O espelho antigo `C:\vertho-deploy2`
tinha o mesmo defeito (parado em 14/08 enquanto o repo andava). Receita (deploys de 16/09 a 19/10):

```powershell
git -C "C:\GAS\Vertho App\nextjs-app" fetch origin master
git -C "C:\GAS\Vertho App\nextjs-app" archive --format=tar -o <scratchpad>\src.tar <SHA>
New-Item -ItemType Directory C:\vertho-deploy-<sha>; tar -xf <scratchpad>\src.tar -C C:\vertho-deploy-<sha>
New-Item -ItemType Junction -Path C:\vertho-deploy-<sha>\node_modules -Target "C:\vertho-nm-master\node_modules"
Set-Location C:\vertho-deploy-<sha>; npx --yes trigger.dev@<versão do package.json DO COMMIT> deploy
```

1. **`node_modules`:** `C:\vertho-nm-master\node_modules` (instalado do `package.json`/lock do master). O do
   disco estava com `@trigger.dev` 4.4.6 e `@sentry` 10.53 contra 4.7.3/10.76 do commit (19/10/2026).
2. **CLI = versão do commit:** `git show <SHA>:package.json`. Versão diferente aborta com "Version mismatch".
3. **Carona:** o deploy leva TUDO que outras sessões subiram até o `<SHA>` e que chega às tasks
   (`git log --since=<deployedAt da versão no ar> <SHA> -- trigger lib actions trigger.config.ts package.json`).
   Diga ao dono o que vai junto ANTES. Qual task usa um arquivo de `lib/`: pergunte ao bundler (memória).
4. **Commit que não é o topo do master:** só se a versão no ar for ANTERIOR a ele
   (`GET https://api.trigger.dev/api/v1/deployments?limit=2`, Bearer `TRIGGER_SECRET_KEY`); senão você
   desfaz o deploy de outra sessão.
5. **Limpeza:** tire a junção com `[IO.Directory]::Delete(<pasta>\node_modules, $false)` (não segue o link).
   A trava do ambiente não deixa apagar `C:\vertho-deploy-*`: sem a junção a pasta é inofensiva, e o dono apaga.

- CLI precisa casar com os packages pinados (hoje `@4.7.3`).
- Trigger project: `proj_wunoneqnozqrfzlvpqjv`.
- Receita detalhada: memória `reference_trigger_deploy` e skill `deploy`.

## Ao editar uma task

- Mudou `trigger/*.ts`? Avise o usuário que **é preciso deploy manual** do Trigger (o `git push` não cobre).
- Tasks dependem de `trigger.config.ts` e de envs configurados no painel do Trigger (não no `.env.local`).
- `RENDER_SNAPSHOT_ID` referencia o bundle do worker Hetzner (o ID **muda a cada rebuild** — não fixe) — ao mudar `worker-hetzner/*`, reconstruir e atualizar o snapshot no Trigger.

## NUNCA

- Pressumir que editar `trigger/` + `git push` atualiza a task em produção (não atualiza).
- Rodar `npx trigger.dev deploy` (sem `@4.7.3`) — pode divergir dos packages pinados.
- Deployar a partir de `C:\GAS\Vertho App` direto (espaço quebra o builder).
- Copiar o DISCO para deployar (robocopy): sobe código velho ou pela metade. Deploye o COMMIT (`git archive`).

## Fontes

- `trigger/` · `trigger.config.ts` · `lib/trigger-region.ts`
- `docs/GERADOR-VIDEO-MODULO.md`, `docs/CHECKLISTS.md`
- Skill `deploy` (§ Trigger.dev) · memória `reference_trigger_deploy`
