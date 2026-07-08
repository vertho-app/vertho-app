---
name: ai-calls
description: Chamar LLM na Vertho App (Claude/Gemini/OpenAI via callAI/callAIChat). Use quando o trabalho envolver actions/ai-client.ts, prompts, geração de cenários/roteiros/conteúdo, Batch API, ou o usuário falar em IA/Claude/Gemini/prompt. Encodes o wrapper único (sem criar outros), prompt caching, batch (−50%), fallback de provedor e a regra de build do 'use server'.
---

# Chamadas de IA (Vertho App)

LLM vai **sempre** por **`callAI`** / **`callAIChat`** em `actions/ai-client.ts` (`'use server'`). **Não criar wrappers novos.**

```ts
import { callAI } from '@/actions/ai-client';

const txt = await callAI(system, user, { model? }, maxTokens?, options?);
```

- Roteia por **prefixo do model**: `claude*` → Anthropic · `gemini*` → Gemini · `gpt*`/`o1*`/`o3*`/`o4*` → OpenAI.
- **Model default: `claude-sonnet-4-6`.** `claude-opus-4-6` **só** para roteiros de vídeo.
- **Fallback de provedor**: Claude sobrecarregado após retries → gera com `gpt-5.4` (`AI_FALLBACK_MODEL`). Retry com backoff+jitter em erros transitórios (429/503/529/overloaded). Timeout default **120s** (`AI_TIMEOUT_MS`).
- **Locale** é resolvido do cookie automaticamente e injeta a instrução de idioma — não traduza manualmente; passe `options.locale` só quando precisar forçar.

## Prompt caching (economia real)

- System **> 4000 chars** já é cacheado automaticamente (`cache_control`).
- Em **lote** com prefixo GRANDE e ESTÁVEL do user (régua + cenário + rubrica, idênticos entre colaboradores do mesmo lote), passe **`options.cachedUserPrefix`** → vira um 2º breakpoint. Chamadas seguintes em 5 min pagam ~10% nesse trecho. (Gemini/OpenAI: concatenado, sem cache.)

## Geração em lote de fundo

Kit/conteúdos/roteiros em background → **`lib/ai-batch.ts`** (Anthropic **Batch API**, **−50%**). Não chame `callAI` num loop de centenas quando dá pra lotear.

## JSON estruturado

Peça JSON no prompt e parseie (helpers em `lib/ai-json.ts`). Campos/enum/códigos ficam em inglês; só os valores textuais voltados ao usuário são traduzidos.

## Opções de `callAI` (`AICallOptions`)

`temperature`, `thinking`, `thinkingBudget`, `locale`, `timeoutMs`, `maxRetries`, `cachedUserPrefix`.

## ⚠️ Regra de BUILD do `'use server'`

Arquivos `'use server'` (como `ai-client.ts` e as `actions/*.ts`) **só podem exportar funções async**. Exportar uma `const`/valor não-função invalida o módulo pro client bundle → `next build` falha com *"The module has no exports at all"* / *"Export X doesn't exist in target module"*. **`tsc --noEmit` não pega isso** (é constraint do Next/Turbopack). Solução: mover consts para um `constants.ts` (sem `'use server'`) e importar de ambos. **Ao editar `'use server'`, rode `npm run build` (não só tsc) antes do push.**

## NUNCA

- Criar wrapper de IA além de `callAI`/`callAIChat`.
- Chamar o SDK Anthropic/Gemini/OpenAI direto numa action nova — passe pelo wrapper.
- Usar `claude-opus-4-6` fora de roteiro de vídeo (custo).
- Exportar `const`/valor não-função de um arquivo `'use server'`.

## Fontes

- `actions/ai-client.ts` · `lib/ai-batch.ts` · `lib/ai-json.ts` · `lib/ia-cost-catalog.ts`
- `docs/CATALOGO-PROMPTS-IA.md`, `docs/checklist-antes-de-prompt-grande.md`
- `CLAUDE.md` § IA · memória `project_architecture`
