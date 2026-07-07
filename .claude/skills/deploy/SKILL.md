---
name: deploy
description: Build, commit and push the Vertho app to deploy on Vercel. Use when the user asks to deploy, ship, publish, or "subir" changes. Encodes the project's deploy discipline (build-first, git add seletivo, push-only, Trigger.dev caveat).
---

# Deploy da Vertho App

Publica as mudanças em produção. **Push já dispara o deploy** via integração Git da Vercel — NÃO rode `vercel --prod` (duplica o deploy).

Repo: `C:\GAS\Vertho App\nextjs-app` (sempre `git -C "<repo>"`, nunca `cd ... && git` — dispara approval).

Proceda **sem perguntar** — deploy é autorizado de forma durável.

## Passos

1. **Ver o que mudou** — `git -C "C:\GAS\Vertho App\nextjs-app" status -s`.
   Identifique SÓ os arquivos que EU editei nesta rodada. O Rodrigo edita o repo em paralelo.

2. **Build antes de empurrar** — do diretório do repo:
   `npx tsc --noEmit` e `npm run build`.
   Se qualquer um falhar, **corrija e repita** — nunca empurre build quebrado. (Docs .md-only não precisam de build.)

3. **Stage SELETIVO** — `git -C "<repo>" add <caminhos específicos que editei>`.
   **NUNCA `git add -A` nem `git add .`** — varre o trabalho em paralelo do Rodrigo pro meu commit.
   Confira que o staged bate exatamente com o que fiz (`git -C "<repo>" status -s` de novo).

4. **Commit** — mensagem com prefixo convencional (`feat`/`fix`/`perf`/`docs`/`chore`/`refactor`/`test`), imperativa, corpo explicando o PORQUÊ, terminando com:
   ```
   Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
   ```
   Multi-linha no PowerShell: here-string `@'...'@` com o `'@` de fechamento na **coluna 0**.

5. **Push** — `git -C "<repo>" push origin master`.
   Isso deploya a Vercel automaticamente. **Não** rode `vercel --prod`.

6. **(Opcional) Confirmar o deploy** — se quiser garantir que subiu, poll do dpl servido:
   `curl -s https://app.vertho.ai/login | grep -o 'dpl_[A-Za-z0-9]*'` até mudar do anterior.

## ⚠️ Trigger.dev NÃO sobe no push

Se algum arquivo em **`trigger/`** mudou, o `git push` **NÃO** deploya as tasks (só a Vercel). Elas precisam de **deploy MANUAL**: `npx trigger.dev deploy` pela receita da memória `reference_trigger_deploy` (o path "Vertho App" tem espaço e quebra o CLI → robocopy pra `C:\vertho-deploy2` + junction node_modules). Avise o usuário se detectar mudança em `trigger/`.

## Nunca

- `vercel --prod` (duplica).
- `git add -A` / `git add .` (varre trabalho paralelo).
- `cd ... && git ...` (approval; use `git -C`).
- Pular hooks/assinatura (`--no-verify`, `--no-gpg-sign`) sem o usuário pedir.
- Empurrar com build/typecheck vermelho.
