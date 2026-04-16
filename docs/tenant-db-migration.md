# Migração para `tenantDb`

## Por que

O `createSupabaseAdmin()` retorna client com `service_role` — **bypassa RLS**. Qualquer query esquecendo `.eq('empresa_id', X)` vaza dados entre tenants.

`tenantDb(empresaId)` (em `lib/tenant-db.js`) é um Proxy que **força `empresa_id` em TODAS queries** de tabelas tenant-owned: select, update, delete, insert e upsert.

## Status por action

Atualizar conforme migrar.

| Action | Status | Prioridade | Notas |
|---|---|---|---|
| `temporadas.js::loadTemporada` | ✅ | crítica | exemplo canônico |
| `temporadas.js::gerarTemporada` | ✅ | crítica | tdb em trilhas/competencias/descriptor_assessments/temporada_semana_progresso; raw em colaboradores+empresas+competencias_base |
| `temporadas.js::loadTemporadaPorEmail` | ✅ | crítica | via loadTemporada |
| `temporadas.js::listarTemporadasEmpresa` | ✅ | alta | empresaId agora obrigatório |
| `fit-v2.js` (8 funções) | ✅ | alta | salvarPerfilIdeal, loadPerfilIdeal, calcularFitIndividual, calcularFitLote, loadRankingCargo, loadFitIndividual, gerarLeituraExecutivaFit, loadCargosComFit |
| `fase1.js::loadTop10` + `loadTop10TodosCargos` + `adicionarTop10` + `removerTop10` + `loadGabaritosCargos` | ✅ | alta | resto do fase1 ainda não |
| `fase1.js` (IA1/IA2/IA3 — rodarIA1/rodarIA2/rodarIA3) | ⬜ | alta | grandes, cross-table; tocar isoladamente |
| `fase3.js` | ⬜ | alta | sessoes_avaliacao |
| `fase5.js` | ⬜ | alta | relatorios — grande, fazer em sub-fases |
| `conteudos.js` | ⏭️ N/A | — | painel curatorial Vertho (cross-tenant intencional) |
| `relatorios.js` | ⬜ | alta | |
| `relatorios-load.js::loadRelatoriosEmpresa` | ✅ | alta | |
| `competencias.js` (3 funções) | ✅ | média | loadCompetencias, salvarCompetencia, excluirCompetencia |
| `preferencias-aprendizagem.js::loadPreferenciasEmpresa` | ✅ | média | loadPreferenciasGlobais mantém raw (cross-tenant) |
| `avaliacao-acumulada.js::gerarAvaliacaoAcumulada` | ✅ | média | helpers refatorados pra receber tdb+sbRaw |
| `evolution-report.js` (2 funções) | ✅ | média | gerarEvolutionReport, loadEvolutionReportsEmpresa |
| `simulador-*.js` | ⬜ | baixa | dev-only |
| `cron-jobs.js` | ⬜ | baixa | jobs periódicos — usar tenantDb por iteração |

## Padrão

### Antes

```js
import { createSupabaseAdmin } from '@/lib/supabase';

export async function foo(colabId) {
  const sb = createSupabaseAdmin();
  const { data } = await sb.from('trilhas')
    .select('*').eq('colaborador_id', colabId);  // sem filtro empresa!
  return { data };
}
```

### Depois

```js
import { createSupabaseAdmin } from '@/lib/supabase';
import { tenantDb } from '@/lib/tenant-db';

export async function foo(colabId) {
  // 1. Descobre tenantId via raw (colaboradores é root de tenancy)
  const sbRaw = createSupabaseAdmin();
  const { data: colab } = await sbRaw.from('colaboradores')
    .select('empresa_id').eq('id', colabId).maybeSingle();
  if (!colab?.empresa_id) return { error: 'Sem empresa_id' };

  // 2. A partir daqui, só tenantDb
  const tdb = tenantDb(colab.empresa_id);
  const { data } = await tdb.from('trilhas')
    .select('*').eq('colaborador_id', colabId);  // empresa_id auto-injetado
  return { data };
}
```

## Regras

### 1. Tabelas TENANT-OWNED (usar tdb)

Todas que têm coluna `empresa_id`:

- colaboradores, competencias, cargos, cargos_empresa
- trilhas, temporada_semana_progresso, descriptor_assessments
- micro_conteudos (quando empresa_id IS NOT NULL)
- sessoes_avaliacao, mensagens_chat, respostas
- fase4_envios, fit_resultados
- banco_cenarios (por empresa), checkpoints_gestor
- pdis, relatorios, videos_watched
- cis_ia_referencia, evolucao, evolucao_descritores
- ia_usage_log

### 2. Tabelas GLOBAIS (usar tdb.raw)

Sem coluna `empresa_id`:

- `competencias_base` — catálogo nacional
- `platform_admins` — admins Vertho
- `prompt_versions` — versões de prompts (global)
- Qualquer tabela meta/sistema

### 3. Cross-tenant legítimo

Admins Vertho ou RH com acesso a múltiplas empresas: use `tdb.raw` explicitamente + valide `isPlatformAdmin` antes.

### 4. Onde NÃO migrar

- **Loading do próprio colab** (ex: `findColabByEmail`) — precisa buscar sem saber o tenant ainda.
- **Auth flows** — antes de saber quem é o usuário.
- **Cron jobs** que iteram todas empresas — use loop com `tenantDb(emp.id)` por iteração.

## Migração incremental

Seguir ordem de prioridade. Em cada action:

1. Identificar tenantId na entrada (via email, id de colab, id de trilha, etc.)
2. Trocar `createSupabaseAdmin()` → `tenantDb(tenantId)` após o ponto onde o tenant é conhecido
3. Manter `createSupabaseAdmin()` (como `sbRaw`) apenas pras queries iniciais de discovery do tenant OR tabelas globais
4. Rodar testes E2E (Playwright) pra validar que nada quebrou
5. Marcar ✅ na tabela acima

Não tentar fazer tudo num PR — refactor longo. Fazer 3-5 actions por semana.
