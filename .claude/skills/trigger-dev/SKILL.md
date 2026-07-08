---
name: trigger-dev
description: Criar, editar e deployar tasks de background (Trigger.dev v4) da Vertho App. Use quando o trabalho envolver arquivos em trigger/, jobs assíncronos/de fundo, ou trabalho pós-response pesado que precisa de retry/status. Encodes que tasks NÃO sobem no git push (deploy manual), o gotcha do path com espaço quebra o CLI, e a decisão after() vs task+status.
---

# Trigger.dev (Vertho App)

Jobs de fundo rodam em **Trigger.dev v4** (`@trigger.dev/sdk` + `@trigger.dev/build`, ambos pinados em **4.4.6**). Tasks vivem em **`trigger/`** (ex.: `acumulada-piloto.ts`, `gerar-kit.ts`, `gerar-video-modulo.ts`, `render-video.ts`, `render-chunk.ts`, `extracao-video.ts`, `estruturar-material.ts`).

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

**Solução**: deployar a partir de um **path sem espaço**:
1. `robocopy` do repo (sem `node_modules`/.git) para `C:\vertho-deploy2`.
2. Criar um **junction** de `node_modules` (ou reinstalar) para não duplicar.
3. Rodar o deploy dali.

```bash
npx trigger.dev@4.4.6 deploy
```

- CLI precisa casar com os packages pinados (`@4.4.6`).
- Trigger project: `proj_wunoneqnozqrfzlvpqjv`.
- Receita detalhada: memória `reference_trigger_deploy` e skill `deploy`.

## Ao editar uma task

- Mudou `trigger/*.ts`? Avise o usuário que **é preciso deploy manual** do Trigger (o `git push` não cobre).
- Tasks dependem de `trigger.config.ts` e de envs configurados no painel do Trigger (não no `.env.local`).
- `RENDER_SNAPSHOT_ID` referencia o bundle do worker Hetzner (o ID **muda a cada rebuild** — não fixe) — ao mudar `worker-hetzner/*`, reconstruir e atualizar o snapshot no Trigger.

## NUNCA

- Pressumir que editar `trigger/` + `git push` atualiza a task em produção (não atualiza).
- Rodar `npx trigger.dev deploy` (sem `@4.4.6`) — pode divergir dos packages pinados.
- Deployar a partir de `C:\GAS\Vertho App` direto (espaço quebra o builder).

## Fontes

- `trigger/` · `trigger.config.ts` · `lib/trigger-region.ts`
- `docs/GERADOR-VIDEO-MODULO.md`, `docs/CHECKLIST-VALIDACAO.md`
- Skill `deploy` (§ Trigger.dev) · memória `reference_trigger_deploy`
