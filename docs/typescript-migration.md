# TypeScript seletivo — plano

## Escolha: permissivo, incremental

TS **não é obrigatório** — `tsconfig.json` tem `allowJs: true` e `strict: false`. Cada arquivo `.js` convive com `.ts`.

Motivação: ganho de tipos em pontos de alto risco (authz, ai-client, season-engine), sem pagar preço de refactor big-bang.

## Status

| Área | Arquivos | Status |
|---|---|---|
| `lib/authz` | authz.ts | ✅ |
| `types/index.d.ts` | Colaborador, UserContext, Role, Trilha, etc. | ✅ |
| `lib/tenant-db` | tenant-db.js | ⬜ próximo |
| `lib/season-engine/*` | select-descriptors.js, build-season.js | ⬜ |
| `actions/ai-client` | ai-client.js | ⬜ (prioridade, chama Anthropic) |
| `lib/pii-masker` | pii-masker.js | ⬜ |
| `actions/temporadas` | temporadas.js | ⬜ (grande, por último) |
| Componentes React | **fora de escopo** | — |

Não converter componentes nem pages — ROI baixo, risco de churn.

## Padrão

### 1. Criar `.ts` ao lado, copiar conteúdo, apagar `.js`

Next resolve `@/lib/foo` tanto pra `.ts` quanto `.js` — imports não mudam.

### 2. Tipar APIs públicas primeiro

Funções exportadas → args tipados + return tipado. Interno pode ficar inferido.

```ts
export async function getUserContext(
  email: string | null | undefined
): Promise<UserContext | null> { ... }
```

### 3. Usar tipos de domínio do `types/index.d.ts`

Não duplicar. Se precisa de tipo novo, adiciona lá.

### 4. `unknown` casts só no retorno do Supabase

Supabase tipa retornos como união ampla; cast pontual:

```ts
return (data?.[0] as unknown as Colaborador) || null;
```

Quando rodarmos `supabase gen types` no futuro, esses casts somem.

## Rodando typecheck

```bash
npx tsc --noEmit --project tsconfig.json
```

Adicionar no `package.json` depois:
```json
"scripts": { "typecheck": "tsc --noEmit" }
```

CI deve rodar `typecheck` em PRs que tocam `.ts` (TODO).

## Pitfalls

- **`public/`** excluído porque tem um pacote legado de report com UTF-8 em nomes de campos
- **`next-env.d.ts`** é gerado automaticamente pelo Next no primeiro `next dev/build` — não commitar se mudar
- **`strict: false`** de propósito — subir pra `strict: true` quando 70%+ dos `.js` virarem `.ts`
- Imports de `@/types` precisam ser `import type` pra não virar runtime dependency

## Próximos arquivos (ordem sugerida)

1. `lib/tenant-db.js` — pequeno, puro, Proxy — vira tipo bonito com generics
2. `actions/ai-client.js` — tipar options e retorno de `callClaude`
3. `lib/season-engine/select-descriptors.js` — tipar DescriptorInput/Output
4. `lib/pii-masker.js` — já funções puras, tipagem trivial

Uma por PR. Não bundle refactor + conversão.
