import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

/**
 * INVARIANTE: os geradores de CONTEÚDO etiquetam suas chamadas de IA.
 *
 * Aqui é onde o dinheiro está. Medido em 31/07 (`ia_usage_log`): o balde
 * `untagged` somava 3.306 chamadas / $97,88 (78% do total), e **$87,28 disso era
 * `claude-sonnet-4-6` via wrapper com ZERO `empresa_id`/`colaborador_id`/
 * `trilha_id`** e output médio de 1.474 tokens — assinatura de geração em lote
 * por script, não de tráfego de usuário. O call-site era `actions/conteudos.ts`,
 * com 4 chamadas e nenhuma etiqueta.
 *
 * O detalhe que explica como passou despercebido: `gerarConteudoIA` JÁ calculava
 * um `taskKey` (`conteudo_video`/`_podcast`/`_texto`/`_case`) — mas só para
 * escolher o modelo em `getModelForTask`. A etiqueta existia e não era repassada
 * ao ledger. Não era esquecimento de nomear, era um fio solto.
 *
 * Sem etiqueta o ledger responde "quanto" e nunca "onde", e decisão de custo
 * vira estimativa. Por isso é teste, não convenção.
 */

const ARQUIVOS = [
  path.join(process.cwd(), 'actions', 'conteudos.ts'),
  path.join(process.cwd(), 'lib', 'season-engine', 'kit', 'brief.ts'),
];

describe('geradores de conteúdo · chamadas de IA etiquetadas no ledger', () => {
  const src = ARQUIVOS.map((f) => readFileSync(f, 'utf8')).join('\n');

  it('as taskKeys de geração estão presentes', () => {
    const esperadas = [
      'conteudo_gerar',          // fallback da geração principal
      'conteudo_expansao_pdf',   // expansão p/ mínimo de caracteres
      'conteudo_personalizacao', // camada por arquétipo/escola
      'conteudo_tags',           // sugestão de tags
      'kit_nucleo',              // núcleo DISC-neutro do kit
      'kit_desafio',             // desafio por DISC
    ];
    for (const key of esperadas) {
      expect(src, `taskKey '${key}' sumiu dos geradores de conteúdo`).toContain(`'${key}'`);
    }
  });

  it('nenhuma chamada de IA nesses arquivos fica sem taskKey', () => {
    // `ai(...)` cobre o caminho injetado (Batch API), que é a mesma chamada.
    const invocacoes = [...src.matchAll(/\b(?:callAI(?:Chat)?|ai)\s*\(\s*(?:system|i === 0)/g)].map((m) => m.index!);
    expect(invocacoes.length).toBeGreaterThan(0);

    // `taskKey:` com dois-pontos, não `taskKey`: em conteudos.ts existe um
    // `const taskKey = ...` (o que escolhe o MODELO) entre duas invocações, e
    // buscar o nome solto fazia o teste passar mesmo com a etiqueta removida —
    // um guard que não podia falhar. Pego na validação por mutação.
    const semEtiqueta: number[] = [];
    invocacoes.forEach((inicio, i) => {
      const fim = invocacoes[i + 1] ?? src.length;
      if (!src.slice(inicio, fim).includes('taskKey:')) {
        semEtiqueta.push(src.slice(0, inicio).split('\n').length);
      }
    });

    expect(semEtiqueta, `chamada(s) sem taskKey por perto da(s) linha(s) ${semEtiqueta.join(', ')}`).toEqual([]);
  });
});

/**
 * C7 (auditoria 22/08) — a mesma exigência, para o caminho de LOTE.
 *
 * O guard acima lê chamadas síncronas. O lote entra por outra porta
 * (`submitClaudeBatch` e irmãs), e ali a etiqueta é um parâmetro `ledger` —
 * quem esquece não recebe `untagged`, recebe `feature: 'batch'`. E `'batch'` é
 * pior: PARECE etiqueta, então não entra na métrica de untagged e a lacuna se
 * esconde dentro do número que está verde.
 *
 * `Medido em 24/08:` 232 chamadas / US$ 5,65 gravadas assim, vindas de quatro
 * call-sites que chamavam o lote sem `ledger` — enquanto o fallback SÍNCRONO
 * logo abaixo, no mesmo arquivo, passava `taskKey` corretamente. Em
 * `gerar-ia3-batch` as duas formas conviviam a duas linhas de distância.
 */
describe('C7 · submissões de LOTE carregam a etiqueta do ledger', () => {
  const ENTRADAS = /\b(submitClaudeBatch|submitOpenAIBatch|createClaudeBatch|createOpenAIBatch|createAIBatchCollector)\s*\(/g;

  /** Arquivos de produção que submetem lote — descobertos, não listados à mão. */
  function callSites(): Array<{ arquivo: string; src: string }> {
    const { execFileSync } = require('node:child_process');
    const out: string = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf-8' });
    return out
      .split('\0')
      .filter((f) => /\.tsx?$/.test(f) && /^(actions|app|lib|trigger)\//.test(f) && !f.includes('/tests/'))
      .filter((f) => f !== 'lib/ai-batch.ts') // o módulo em si define as funções
      .map((arquivo) => ({ arquivo, src: readFileSync(arquivo, 'utf8') }))
      .filter(({ src }) => { ENTRADAS.lastIndex = 0; return ENTRADAS.test(src); });
  }

  it('o guard enxerga call-sites de lote (não passou vazio por engano)', () => {
    expect(callSites().length).toBeGreaterThan(2);
  });

  it('nenhuma submissão de lote fica sem `ledger`', () => {
    const semLedger: string[] = [];
    for (const { arquivo, src } of callSites()) {
      ENTRADAS.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = ENTRADAS.exec(src)) !== null) {
        // Da abertura do parêntese até o fim da chamada (o `;` da linha).
        const fim = src.indexOf(';', m.index);
        const trecho = src.slice(m.index, fim > 0 ? fim : m.index + 400);
        if (!/\bledger\s*:/.test(trecho)) {
          const linha = src.slice(0, m.index).split('\n').length;
          semLedger.push(`  ❌ ${arquivo}:${linha}  ${m[1]}(…)`);
        }
      }
    }
    if (semLedger.length > 0) {
      throw new Error(
        `${semLedger.length} submissão(ões) de lote sem \`ledger\`:\n${semLedger.join('\n')}\n\n` +
        'Sem ele o custo cai como `feature: "batch"` — que parece etiqueta e some\n' +
        'dentro da métrica de untagged. Passe `{ ledger: { feature, empresaId } }`\n' +
        'com a MESMA etiqueta do fallback síncrono do próprio arquivo.',
      );
    }
  });
});
