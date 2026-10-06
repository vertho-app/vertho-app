/**
 * Guard: filtro do PostgREST montado por texto só com valor tratado.
 *
 * Por que existe (reanálise de 05/10/2026): o supabase-js monta `.or('a.eq.' + x)` por concatenação, e
 * vírgula, ponto e parêntese são a SINTAXE do filtro: um valor com `,id.not.is.null` vira uma condição
 * OR a mais. `valorDeFiltro` (aspas) e `escaparLike` (curinga do `%`/`_`) já existiam, mas só dois
 * arquivos os usavam, e o filtro mais repetido da base, "as linhas da empresa e as globais", estava
 * escrito à mão em 20 lugares. Cinco deles recebiam o id de um parâmetro de Server Action ou de rota,
 * atrás de um gate de tenant que só compara igualdade: não era explorável, mas era uma classe sem freio.
 *
 *  · `.or(` com template literal: cada `${…}` tem que passar por `valorDeFiltro(` ou `empresaOuGlobal(`,
 *    ou estar na lista PERMITIDA, com o motivo (validado por regex, constante do código, data ISO…);
 *  · `.ilike(`/`.like(` com template literal: cada `${…}` tem que passar por `escaparLike(`, ou estar na lista.
 *
 * Lista permitida de propósito curta e com motivo: um uso novo tem que ser tratado ou justificado AQUI.
 * Validado por mutação: voltar um dos 20 `.or(` ao id cru, ou um `.ilike` ao texto cru, reprova o teste.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { empresaOuGlobal, valorDeFiltro } from '@/lib/postgrest-valor';
import { semComentarios } from '../../helpers/fonte';

type Achado = { arquivo: string; linha: number; chamada: string; expressao: string };

/** `${…}` de um template literal começando em `src[i] === '`'`, com aninhamento de chaves e de templates. */
function expressoesDoTemplate(src: string, i: number): string[] {
  const exprs: string[] = [];
  let j = i + 1;
  while (j < src.length && src[j] !== '`') {
    if (src[j] === '\\') { j += 2; continue; }
    if (src[j] === '$' && src[j + 1] === '{') {
      let prof = 1; let k = j + 2;
      while (k < src.length && prof > 0) {
        if (src[k] === '{') prof++;
        else if (src[k] === '}') prof--;
        k++;
      }
      exprs.push(src.slice(j + 2, k - 1).trim());
      j = k;
      continue;
    }
    j++;
  }
  return exprs;
}

function arquivosDeProducao(): string[] {
  const lista = execFileSync('git', ['ls-files', '-z', '*.ts', '*.tsx'], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\0');
  return lista.filter((f) => f && existsSync(f) && !f.startsWith('tests/') && !f.startsWith('scripts/') && !f.startsWith('gas-antigo/') && !/\.test\./.test(f));
}

/** Procura `.metodo(` e, no argumento de interesse (1º para `.or`, 2º para `.ilike`/`.like`), um template com `${…}`. */
function acharChamadas(metodo: 'or' | 'ilike' | 'like', argumento: 0 | 1): Achado[] {
  const achados: Achado[] = [];
  const padrao = new RegExp(`\\.${metodo}\\(`, 'g');
  for (const arquivo of arquivosDeProducao()) {
    const src = semComentarios(readFileSync(arquivo, 'utf-8'));
    for (const m of src.matchAll(padrao)) {
      let i = m.index! + m[0].length;
      if (argumento === 1) {
        // pula o 1º argumento até a vírgula de nível 0 (a coluna é um literal curto)
        let prof = 0;
        while (i < src.length && !(prof === 0 && src[i] === ',') && src[i] !== '\n') {
          if ('([{'.includes(src[i])) prof++;
          else if (')]}'.includes(src[i])) prof--;
          i++;
        }
        if (src[i] !== ',') continue;
        i++;
      }
      while (/\s/.test(src[i] ?? '')) i++;
      if (src[i] !== '`') continue;
      const linha = src.slice(0, m.index).split('\n').length;
      for (const expressao of expressoesDoTemplate(src, i)) achados.push({ arquivo, linha, chamada: `.${metodo}(`, expressao });
    }
  }
  return achados;
}

/** Interpolações que NÃO passam pelo helper e são seguras por outro motivo, verificado em 05/10/2026. */
const PERMITIDAS: Array<{ arquivo: string; expressao: string; motivo: string }> = [
  { arquivo: 'actions/modulos-base.ts', expressao: 'cf', motivo: 'só chega ali depois de passar pelo regex de UUID' },
  { arquivo: 'actions/sales/accounts.ts', expressao: 'term', motivo: 'o termo perde `%`, `_`, vírgula e parênteses antes de entrar' },
  { arquivo: 'app/radar/actions.ts', expressao: 'q', motivo: 'só entra no ramo em que `q` casou ^\\d{6,8}$ ou ^\\d{7}$' },
  { arquivo: 'lib/home/loaders.ts', expressao: 'new Date().toISOString().slice(0, 10)', motivo: 'data gerada no servidor' },
  { arquivo: 'lib/internal-emails.ts', expressao: 'column', motivo: 'nome de coluna passado por código (padrão `email`), nunca por usuário' },
  { arquivo: 'lib/pipeline-health/coleta.ts', expressao: '[...tenantsReais].join(\',\')', motivo: 'ids de empresa lidos do banco pelo próprio health' },
  { arquivo: 'lib/pipeline-health/core.ts', expressao: 'new Date(Date.now() - idadeMs).toISOString()', motivo: 'data gerada no servidor' },
  { arquivo: 'lib/simulador-lideranca/service.ts', expressao: 'new Date().toISOString()', motivo: 'data gerada no servidor' },
  { arquivo: 'lib/simulador-vendas/historico.ts', expressao: 'c.em', motivo: 'cursor validado com zod (datetime ISO)' },
  { arquivo: 'lib/simulador-vendas/historico.ts', expressao: 'c.id', motivo: 'cursor validado com zod (uuid)' },
  { arquivo: 'lib/custo-ia/relatorio-semanal.ts', expressao: 'inst.prefixoSource', motivo: 'prefixo constante do código' },
  { arquivo: 'lib/demo/reset-acme-demo.ts', expressao: 'prefixo', motivo: 'prefixo constante do seed de demonstração' },
];

const tratado = (e: string, ...helpers: string[]) => helpers.some((h) => e.includes(`${h}(`));
const liberado = (a: Achado) => PERMITIDAS.some((p) => p.arquivo === a.arquivo && p.expressao === a.expressao);
const relatorio = (xs: Achado[]) => xs.map((a) => `${a.arquivo}:${a.linha}  ${a.chamada} \${${a.expressao}}`).join('\n');

describe('empresaOuGlobal', () => {
  it('id simples (UUID, slug, id de teste) vira "da empresa ou global"', () => {
    expect(empresaOuGlobal('10000000-0000-4000-8000-000000000001')).toBe('empresa_id.eq.10000000-0000-4000-8000-000000000001,empresa_id.is.null');
    expect(empresaOuGlobal('e1')).toBe('empresa_id.eq.e1,empresa_id.is.null');
    expect(empresaOuGlobal('emp_1-a', 'empresa_id')).toBe('empresa_id.eq.emp_1-a,empresa_id.is.null');
  });

  it.each([
    ['vírgula (outra condição)', 'x,id.not.is.null'],
    ['parêntese', 'x),and(id.not.is.null'],
    ['ponto', 'a.b'],
    ['aspas', 'x"y'],
    ['espaço', 'a b'],
    ['vazio', ''],
    ['grande demais', 'a'.repeat(65)],
  ])('🔴 %s: nenhuma condição a mais, só as linhas globais', (_n, valor) => {
    expect(empresaOuGlobal(valor)).toBe('empresa_id.is.null');
  });

  it('null e undefined também só devolvem as globais', () => {
    expect(empresaOuGlobal(null)).toBe('empresa_id.is.null');
    expect(empresaOuGlobal(undefined)).toBe('empresa_id.is.null');
  });

  it('a coluna é a que o código pediu', () => {
    expect(empresaOuGlobal('e1', 'escopo_empresa_id')).toBe('escopo_empresa_id.eq.e1,escopo_empresa_id.is.null');
  });
});

describe('o scanner enxerga o que procura (alvo vivo)', () => {
  it('acha os `.or(` com template que existem hoje, inclusive o de template aninhado', () => {
    const or = acharChamadas('or', 0);
    expect(or.length).toBeGreaterThanOrEqual(10);
    expect(or.some((a) => a.arquivo === 'lib/relatorio-individual-prompt.ts' && tratado(a.expressao, 'valorDeFiltro'))).toBe(true);
  });

  it('a lista permitida só tem entradas que o scanner ainda encontra (não acumula lixo)', () => {
    const todos = [...acharChamadas('or', 0), ...acharChamadas('ilike', 1), ...acharChamadas('like', 1)];
    const orfas = PERMITIDAS.filter((p) => !todos.some((a) => a.arquivo === p.arquivo && a.expressao === p.expressao));
    expect(orfas.map((p) => `${p.arquivo} \${${p.expressao}}`)).toEqual([]);
  });

  it('valorDeFiltro continua entre aspas (o que o scanner considera "tratado")', () => {
    expect(valorDeFiltro('a,b')).toBe('"a,b"');
  });
});

describe('🔴 filtro do PostgREST montado por texto', () => {
  it('`.or(` com template: cada ${…} passa por valorDeFiltro/empresaOuGlobal ou está na lista permitida', () => {
    const sem = acharChamadas('or', 0).filter((a) => !tratado(a.expressao, 'valorDeFiltro', 'empresaOuGlobal') && !liberado(a));
    expect(sem, `interpolação crua em .or():\n${relatorio(sem)}`).toEqual([]);
  });

  it('`.ilike(` com template: cada ${…} passa por escaparLike ou está na lista permitida', () => {
    const sem = acharChamadas('ilike', 1).filter((a) => !tratado(a.expressao, 'escaparLike') && !liberado(a));
    expect(sem, `curinga do usuário em .ilike():\n${relatorio(sem)}`).toEqual([]);
  });

  it('`.like(` com template: idem', () => {
    const sem = acharChamadas('like', 1).filter((a) => !tratado(a.expressao, 'escaparLike') && !liberado(a));
    expect(sem, `curinga do usuário em .like():\n${relatorio(sem)}`).toEqual([]);
  });
});
