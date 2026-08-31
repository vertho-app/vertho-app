// Guard: cada regra do health-check tem um ID ÚNICO, e o índice do arquivo bate
// com as regras que existem.
//
// 🔴 POR QUE ESTE GUARD (31/08/2026): `R7` e `R10` estavam duplicados em
// `lib/pipeline-health/regras.ts` — R7 era o pós-voo *e* o horizonte de kits; R10
// era a telemetria de degradação *e* a célula de vídeo em erro.
//
// O custo não foi hipotético: a ambiguidade JÁ tinha vazado para a documentação.
// O `docs/FMEA-PIPELINE.md` descrevia "R10" como a regra de vídeo, enquanto
// `CLAUDE.md`, `docs/RESUMO.md` e dois testes descreviam "R10" como a de
// degradação — duas verdades sobre o mesmo rótulo, no mesmo repositório. Quem
// recebe um alerta "R10" e vai procurar a causa cai em uma das duas por sorteio.
//
// O ID não é decorativo: ele é a chave que liga o alarme em produção à regra que
// o gerou, e é citado em docs, testes e outros módulos (`lib/degradacao.ts`,
// `lib/admin-supabase.ts`). Por isso o guard cobre as duas pontas — unicidade E
// sincronia com o índice.
import { readFileSync } from 'fs';
import { describe, it, expect } from 'vitest';

const CAMINHO = 'lib/pipeline-health/regras.ts';
const fonte = readFileSync(CAMINHO, 'utf-8');

/** IDs declarados no cabeçalho de cada regra: linhas ` * R<n>[b] · ...` ou ` * R14 — ...` */
function idsDasRegras(): string[] {
  return [...fonte.matchAll(/^ \* (R\d+[a-z]?)\s*[·—-]/gm)].map((m) => m[1]);
}

/** Pares (ID, função) do bloco de ÍNDICE no topo do arquivo. */
function indice(): Array<[string, string]> {
  const cabecalho = fonte.slice(0, fonte.indexOf('*/'));
  return [...cabecalho.matchAll(/\b(R\d+[a-z]?)\s+(checar[A-Za-z]+)/g)].map((m) => [m[1], m[2]]);
}

/** Funções de regra exportadas (`export function checarX`). */
function funcoesExportadas(): string[] {
  return [...fonte.matchAll(/^export function (checar[A-Za-z]+)/gm)].map((m) => m[1]);
}

describe('IDs das regras do health-check', () => {
  it('o arquivo declara regras (senão este guard não prova nada)', () => {
    expect(idsDasRegras().length).toBeGreaterThan(10);
    expect(indice().length).toBeGreaterThan(10);
  });

  it('🔴 nenhum ID de regra aparece duas vezes', () => {
    const ids = idsDasRegras();
    const vistos = new Set<string>();
    const duplicados = ids.filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
    expect(
      duplicados,
      'ID duplicado em regras.ts: um achado com esse rótulo fica ambíguo entre duas regras, '
      + 'e foi assim que o FMEA e o CLAUDE.md passaram a documentar "R10" como coisas diferentes',
    ).toEqual([]);
  });

  it('🔴 nenhum ID do ÍNDICE aparece duas vezes', () => {
    const ids = indice().map(([id]) => id);
    const vistos = new Set<string>();
    const duplicados = ids.filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)));
    expect(duplicados, 'ID repetido no índice do cabeçalho').toEqual([]);
  });

  it('🔴 o índice cobre todas as regras declaradas, e só elas', () => {
    const declarados = new Set(idsDasRegras());
    const noIndice = new Set(indice().map(([id]) => id));

    const semIndice = [...declarados].filter((id) => !noIndice.has(id));
    const soNoIndice = [...noIndice].filter((id) => !declarados.has(id));

    expect(semIndice, 'regra sem entrada no índice do topo do arquivo').toEqual([]);
    expect(soNoIndice, 'índice cita ID que não corresponde a nenhuma regra (regra removida?)').toEqual([]);
  });

  it('🔴 toda função nomeada no índice existe e é exportada', () => {
    const exportadas = new Set(funcoesExportadas());
    const fantasmas = indice().filter(([, fn]) => !exportadas.has(fn));
    expect(
      fantasmas.map(([id, fn]) => `${id} -> ${fn}`),
      'índice aponta para função que não existe: o mapa ID→regra é a única fonte que liga '
      + 'um alerta em produção ao código que o gerou',
    ).toEqual([]);
  });

  it('🔴 toda função de regra exportada está no índice', () => {
    // Sem isto, regra nova nasce sem ID — e alerta sem ID não tem como ser citado
    // em doc nem rastreado quando dispara.
    const noIndice = new Set(indice().map(([, fn]) => fn));
    // Sem exceção: `regrasPreflight`/`regrasPostflight` são agregadores e já ficam
    // de fora por não casarem o prefixo `checar`. Uma allowlist aqui seria um ramo
    // morto — e ramo morto num guard é onde a próxima cegueira se esconde.
    const fora = funcoesExportadas().filter((fn) => !noIndice.has(fn));
    expect(fora, 'função de regra sem ID no índice').toEqual([]);
  });
});
