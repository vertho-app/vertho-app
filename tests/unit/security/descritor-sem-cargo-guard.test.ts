import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Guard: leitura de `competencias` por `cod_comp` sem dizer de QUAL CARGO.
 *
 * A matriz é gravada por cargo (`competencias.cargo`). A mesma matriz em dois
 * cargos da mesma empresa — professora e auxiliar com a mesma régua, cada uma com
 * o seu cenário — são duas cópias com o mesmo `cod_comp`. Uma leitura só por
 * `cod_comp` devolve as duas: a IA3 recebe "distribua os 12 descritores" em vez
 * de 6 e a IA4 pontua contra régua repetida. Em silêncio: nada erra, o prompt só
 * fica maior. Em 16/09/2026 eram 8 leituras assim, todas latentes porque nenhum
 * tenant tinha ainda a mesma matriz em 2 cargos (medido: 1 `cod_comp` em 2
 * cargos no banco inteiro, sem descritores).
 *
 * **Sem allowlist de propósito**: o estoque ficou zero. Saídas:
 *  - `buscarDescritoresDaCompetencia(tdb, comp, colunas)` (`lib/matriz-por-cargo.ts`),
 *    com `cargo` no select da linha da competência — o helper LANÇA se faltar;
 *  - em lote, `.in('cod_comp', …).in('cargo', …)` e agrupar por `cod_comp::cargo`
 *    (o guard vê o filtro; o agrupamento é coberto por `tests/unit/matriz-por-cargo.test.ts`).
 *
 * Limites declarados: não vê tabela em variável (`sb.from(tabela)`, caso de
 * `lib/manuscrito-modulos.ts`, que já falha fechado com 2 cargos) nem filtro
 * acrescentado depois em `q = q.eq(…)`. Recorte: `actions`, `app`, `lib`,
 * `trigger` — `scripts/` é diagnóstico one-off.
 */

const DIRS = ['actions', 'app', 'lib', 'trigger'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

/** Filtra por código da competência. */
const FILTRA_COD_COMP = /\.(eq|in)\(\s*['"]cod_comp['"]/;
/** Diz de qual cargo — a cadeia deixa de misturar as cópias da matriz. */
const FILTRA_CARGO = /\.(eq|in|is)\(\s*['"]cargo['"]/;

/** Cada `.from('competencias')` até o fim da statement — a mesma fatia para o detector e para a trava anti-cego. */
function cadeiasDoTexto(content: string): string[] {
  const cadeias: string[] = [];
  const PADRAO = /\.from\(\s*['"]competencias['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = PADRAO.exec(content)) !== null) {
    // Corta no fim da statement OU no próximo `.from(`: sem isso, o `.eq('cargo')`
    // da query seguinte absolveria esta cadeia (falso negativo) — inclusive o ramo
    // do ternário vizinho, que divide o mesmo `;` (medido por mutação no helper).
    const candidatos = [content.indexOf(';', m.index), content.indexOf('.from(', m.index + 1)].filter((i) => i !== -1);
    const fim = candidatos.length ? Math.min(...candidatos, m.index + 900) : m.index + 600;
    cadeias.push(content.slice(m.index, fim));
  }
  return cadeias;
}

/** Cadeias suspeitas num texto. Exportado para o autoteste: detector nunca exercitado não prova nada. */
export function violacoesNoTexto(content: string): string[] {
  return cadeiasDoTexto(content)
    .filter((cadeia) => FILTRA_COD_COMP.test(cadeia) && !FILTRA_CARGO.test(cadeia))
    .map((cadeia) => cadeia.replace(/\s+/g, ' ').slice(0, 160));
}

function scanDir(dir: string, out: Record<string, string[]>, stats: { arquivos: number; cadeias: number; porCodComp: number }) {
  let entries: string[];
  try { entries = readdirSync(dir); } catch { return; }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let stat;
    try { stat = statSync(full); } catch { continue; }
    if (stat.isDirectory()) { scanDir(full, out, stats); continue; }
    if (!EXTENSIONS.has(extname(entry))) continue;
    const rel = full.replace(/\\/g, '/');
    if (rel.includes('/tests/')) continue;

    let content: string;
    try { content = readFileSync(full, 'utf-8'); } catch { continue; }
    stats.arquivos++;
    const cadeias = cadeiasDoTexto(content);
    if (!cadeias.length) continue;
    stats.cadeias += cadeias.length;
    stats.porCodComp += cadeias.filter((c) => FILTRA_COD_COMP.test(c)).length;

    const achados = violacoesNoTexto(content);
    if (achados.length) out[rel] = achados;
  }
}

const violacoes: Record<string, string[]> = {};
const stats = { arquivos: 0, cadeias: 0, porCodComp: 0 };
for (const d of DIRS) scanDir(d, violacoes, stats);

describe('Guard: descritores de competência lidos sem o cargo da matriz', () => {
  it('nenhuma leitura de competencias por cod_comp sem cargo no código de produção', () => {
    const arquivos = Object.keys(violacoes);
    if (arquivos.length > 0) {
      throw new Error(
        `Leitura de competencias por cod_comp sem filtrar cargo (${arquivos.length} arquivo(s)):\n` +
        arquivos.map((f) => `  ❌ ${f}\n     ${violacoes[f].join('\n     ')}`).join('\n') +
        '\n\nA matriz é POR CARGO: a mesma matriz em 2 cargos da empresa devolveria os descritores em dobro.' +
        "\nSaída: buscarDescritoresDaCompetencia(tdb, comp, colunas) de lib/matriz-por-cargo.ts" +
        " (com `cargo` no select da competência), ou .in('cargo', …) + agrupar por cod_comp::cargo."
      );
    }
  });

  it('o guard não está cego (leu o repo e achou as leituras de competencias)', () => {
    // Varredura de DISCO, não `git ls-files`: arquivo novo ainda não commitado também conta.
    expect(stats.arquivos).toBeGreaterThan(300);
    expect(stats.cadeias).toBeGreaterThanOrEqual(50);
    // As saídas legítimas também filtram cod_comp: se isto cair a zero, a regex parou de casar.
    expect(stats.porCodComp).toBeGreaterThanOrEqual(3);
  });

  it('o detector reconhece as formas que existiam até 16/09 (regressão sintética)', () => {
    // montarContextoIA3 / carregarContextoRespostaIA4
    expect(violacoesNoTexto(`
      const { data: descritores } = await tdb.from('competencias')
        .select('cod_desc, nome_curto, n1_gap')
        .eq('cod_comp', comp.cod_comp)
        .not('cod_desc', 'is', null);
    `)).toHaveLength(1);
    // check-ia4-core: empresa filtrada não resolve o cargo
    expect(violacoesNoTexto(
      `const { data: descs } = await sb.from('competencias').select('cod_desc').eq('empresa_id', empresaId).eq('cod_comp', comp?.cod_comp).not('cod_desc', 'is', null);`
    )).toHaveLength(1);
    // reavaliacao em lote
    expect(violacoesNoTexto(
      `const { data: todos } = await tdb.from("competencias").select('cod_comp, cod_desc').in('cod_comp', codComps).not('cod_desc', 'is', null);`
    )).toHaveLength(1);
  });

  it('o detector NÃO acusa as formas corretas', () => {
    // (a) o helper, nos dois ramos
    expect(violacoesNoTexto(`
      const doCargo = comp.cargo
        ? db.from('competencias').select(colunas).eq('cod_comp', comp.cod_comp).eq('cargo', comp.cargo)
        : db.from('competencias').select(colunas).eq('cod_comp', comp.cod_comp).is('cargo', null);
    `)).toHaveLength(0);
    // (b) lote com o cargo no filtro
    expect(violacoesNoTexto(
      `await tdb.from('competencias').select('cod_comp, cargo').in('cod_comp', codComps).in('cargo', cargos).not('cod_desc', 'is', null);`
    )).toHaveLength(0);
    // (c) por id não é ambíguo, e não filtra cod_comp
    expect(violacoesNoTexto(`await tdb.from('competencias').select('nome, cod_comp, cargo').eq('id', id).maybeSingle();`)).toHaveLength(0);
    // (d) o `.eq('cargo')` da query vizinha não absolve a cadeia anterior
    expect(violacoesNoTexto(`
      const a = await tdb.from('competencias').select('cod_desc').eq('cod_comp', x);
      const b = await tdb.from('competencias').select('cod_desc').eq('cod_comp', x).eq('cargo', y);
    `)).toHaveLength(1);
    // (e) nem o ramo do ternário ao lado, que divide o mesmo `;`
    expect(violacoesNoTexto(`
      const q = comp.cargo
        ? db.from('competencias').select(colunas).eq('cod_comp', comp.cod_comp)
        : db.from('competencias').select(colunas).eq('cod_comp', comp.cod_comp).is('cargo', null);
    `)).toHaveLength(1);
  });
});
