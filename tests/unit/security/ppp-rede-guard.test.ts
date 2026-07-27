import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';
import { describe, it, expect } from 'vitest';

/**
 * Guard: leitura de `ppp_escolas` que reduz a UMA linha sem dizer QUAL escola.
 *
 * Empresa-rede tem **1 PPP por escola** (Ibipeba: 11 para 13 escolas). Uma cadeia
 * `.eq('status','extraido').order('extracted_at').limit(1)` devolve uma escola
 * sorteada pela data de extração e o código a trata como o município inteiro — a
 * régua, o kit ou o PDF saem calibrados na escola errada, **em silêncio**: nada erra,
 * nenhuma tela mostra, nenhum teste de comportamento falha. É o modo de falha F-I10
 * (`docs/FMEA-PIPELINE.md`), que apareceu em 4 consumidores independentes antes de
 * alguém notar — por isso virou guard e não só regra escrita.
 *
 * **Sem allowlist de propósito.** Os 4 sites foram fechados em 27/07, então o estoque
 * é ZERO: não há dívida legada a declarar, e toda leitura legítima de uma escola só
 * passa naturalmente (ver as saídas abaixo). Se algum dia uma exceção real aparecer,
 * ela entra aqui com justificativa — não como número numa lista.
 *
 * Saídas (o que o guard aceita):
 *  - `.eq('id', pppEscolaId)` / `.eq('escola', ...)` — diz QUAL escola, sem ambiguidade;
 *  - buscar TODAS e consolidar: `resolverContextoEmpresa` (texto) ou
 *    `consolidarValoresDaRede` (valores). Para o contexto do PPP o resolvedor pronto é
 *    `buscarContextoPPP(tdb, { empresaId })`.
 *
 * Recorte: só código de produção (`actions`, `app`, `lib`, `trigger`). `scripts/` fica
 * fora porque script é diagnóstico one-off que não entrega nada a ninguém — incluí-lo
 * encheria o guard de ruído e o guard ruidoso é desligado.
 */

const DIRS = ['actions', 'app', 'lib', 'trigger'];
const EXTENSIONS = new Set(['.ts', '.tsx']);
const IGNORE_DIRS = new Set(['node_modules', '.next', '.git', 'test-results', 'playwright-report']);

/** Reduz o resultado a uma linha só. */
const REDUZ_A_UMA = /\.limit\(1\)|\.maybeSingle\(\)|\.single\(\)/;
/** Diz QUAL escola — a cadeia deixa de ser ambígua. */
const IDENTIFICA_ESCOLA = /\.eq\('id'|\.eq\("id"|\.eq\('escola'|\.in\('id'/;

/**
 * Conta cadeias suspeitas num texto. Exportado para o auto-teste: um guard cujo
 * detector nunca foi exercitado não prova nada (a cadeia é multi-linha e a regex é
 * frágil por natureza).
 */
export function violacoesNoTexto(content: string): string[] {
  const achados: string[] = [];
  const PADRAO = /\.from\(\s*['"]ppp_escolas['"]\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = PADRAO.exec(content)) !== null) {
    // Corta no fim da statement: sem isso, um `.eq('id')` da query SEGUINTE absolveria
    // esta cadeia (falso negativo) e um `.limit(1)` alheio acusaria (falso positivo).
    const fimStatement = content.indexOf(';', m.index);
    const fim = fimStatement === -1 ? m.index + 600 : Math.min(fimStatement, m.index + 900);
    const cadeia = content.slice(m.index, fim);
    if (REDUZ_A_UMA.test(cadeia) && !IDENTIFICA_ESCOLA.test(cadeia)) {
      achados.push(cadeia.replace(/\s+/g, ' ').slice(0, 160));
    }
  }
  return achados;
}

function scanDir(dir: string, out: Record<string, string[]>, stats: { arquivos: number; comPpp: number }) {
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
    if (!content.includes('ppp_escolas')) continue;
    stats.comPpp++;

    const achados = violacoesNoTexto(content);
    if (achados.length) out[rel] = achados;
  }
}

const violacoes: Record<string, string[]> = {};
const stats = { arquivos: 0, comPpp: 0 };
for (const d of DIRS) scanDir(d, violacoes, stats);

describe('Guard: ppp_escolas reduzido a uma linha sem dizer qual escola (F-I10)', () => {
  it('nenhuma leitura ambígua de PPP no código de produção', () => {
    const arquivos = Object.keys(violacoes);
    if (arquivos.length > 0) {
      throw new Error(
        `Leitura de ppp_escolas que pega UMA escola sem identificá-la (${arquivos.length} arquivo(s)):\n` +
        arquivos.map((f) => `  ❌ ${f}\n     ${violacoes[f].join('\n     ')}`).join('\n') +
        '\n\nEmpresa-rede tem 1 PPP por ESCOLA: isso aplica uma escola sorteada à rede inteira, em silêncio.' +
        "\nSaídas: .eq('id', pppEscolaId) para uma escola específica, ou consolidar" +
        ' (buscarContextoPPP(tdb, {empresaId}) / resolverContextoEmpresa / consolidarValoresDaRede).' +
        '\nDetalhe: F-I10 em docs/FMEA-PIPELINE.md.'
      );
    }
  });

  it('o guard não está cego (leu o repo e achou os consumidores de PPP)', () => {
    // Um guard que varre zero arquivo passa sempre. Varredura é de DISCO (não `git
    // ls-files`) de propósito: arquivo novo ainda não commitado também é conferido —
    // senão o local fica verde e o CI vermelho só depois do commit.
    expect(stats.arquivos).toBeGreaterThan(300);
    expect(stats.comPpp).toBeGreaterThanOrEqual(5);
  });

  it('o detector reconhece o padrão que causou o bug (regressão sintética)', () => {
    // Exatamente a forma que vivia em ia2-gabarito/ia3-cenarios/conteudos antes de 27/07.
    const antigo = `
      const { data: ppp } = await sb.from('ppp_escolas')
        .select('extracao')
        .eq('empresa_id', empresaId)
        .eq('status', 'extraido')
        .order('extracted_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    `;
    expect(violacoesNoTexto(antigo)).toHaveLength(1);

    // Variante numa linha só, e a que usa single() sem limit.
    expect(violacoesNoTexto(`await tdb.from('ppp_escolas').select('extracao').limit(1);`)).toHaveLength(1);
    expect(violacoesNoTexto(`await tdb.from("ppp_escolas").select('valores').eq('status','extraido').single();`)).toHaveLength(1);
  });

  it('o detector NÃO acusa as formas corretas', () => {
    // (a) diz qual escola
    expect(violacoesNoTexto(
      `const { data } = await tdb.from('ppp_escolas').select('extracao').eq('id', pppEscolaId).maybeSingle();`
    )).toHaveLength(0);
    // (b) busca todas para consolidar (sem redução)
    expect(violacoesNoTexto(
      `const { data: ppps } = await sb.from('ppp_escolas').select('extracao, extracted_at')
         .eq('empresa_id', empresaId).eq('status', 'extraido').order('extracted_at', { ascending: false });`
    )).toHaveLength(0);
    // (c) contagem (head) — não entrega contexto a ninguém
    expect(violacoesNoTexto(
      `sb.from('ppp_escolas').select('id', { count: 'exact', head: true }).eq('empresa_id', empresaId);`
    )).toHaveLength(0);
    // (d) o `.eq('id')` de uma query vizinha não absolve a cadeia ambígua anterior
    const duas = `
      const a = await sb.from('ppp_escolas').select('extracao').eq('status','extraido').limit(1).maybeSingle();
      const b = await sb.from('ppp_escolas').select('extracao').eq('id', pppEscolaId).maybeSingle();
    `;
    expect(violacoesNoTexto(duas)).toHaveLength(1);
  });
});
