import { describe, it, expect } from 'vitest';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { semComentarios } from '../../helpers/fonte';

/**
 * Guard: nenhuma tela nem PDF do CLIENTE imprime nota decimal (decisão 1 do dono,
 * revisão de 02/10/2026, lote 5 de 04/10/2026).
 *
 * "Ninguém do cliente vê nota decimal: pessoa, gestor e RH veem Nível 1 a 4 e avanço.
 * A nota decimal fica só no admin da Vertho." A decisão foi tomada tela a tela (Minha
 * evolução, home do gestor, central do RH, PDF executivo, PDI, simuladores, piloto) e a
 * revisão achou o mesmo erro em doze lugares: ele volta toda vez que alguém escreve
 * `nota.toFixed(1)` numa tela nova, porque o número é o jeito mais curto de mostrar
 * algo. Este guard é o freio.
 *
 * O que varre:
 *  1. CÓDIGO: `.toFixed(` em identificador de nota, média, score ou delta cru, nos
 *     componentes de cliente (`app/dashboard`, `components`, `lib/**.tsx` dos PDFs).
 *     Fora o admin da Vertho, o Pulso, o Radar e o Comercial (não são nota de
 *     competência do cliente). O avanço passa por `formatarValorAvanco`, que tem piso
 *     zero, e não por `toFixed` num delta cru.
 *  2. TEXTO: nenhum idioma tem "{x} de 4" (nota + escala) nem "nota média" fora dos
 *     namespaces do admin.
 *
 * ALLOWLIST: dívida declarada, SÓ PODE ENCOLHER. Entrada nova aqui é exatamente o bug
 * que o guard existe para pegar; entrada que já não acusa também reprova (limpe-a).
 * VAZIA desde 04/10/2026 (lote 5b). Eram três: o PDF de RH gerado por IA e o PDF do DNA
 * organizacional passaram a imprimir o nível mais frequente (e o DNA parou de mandar a
 * média à IA que escreve o texto do PDF); e o ranking de preferências de aprendizagem,
 * que só o admin da Vertho abre e mostra a média de PREFERÊNCIA de formato (escala de 1 a
 * 5, não nota de competência), foi para `components/admin`, que o guard já exclui, em vez
 * de ficar como dívida.
 */
const ALLOWLIST: Record<string, number> = {};

const FORA = [
  'app/admin', 'components/admin', 'lib/demo', 'lib/radar', 'lib/sales', 'components/radar',
  'components/sales', 'components/pulse', 'components/radarempresas', 'components/pdf/RadarProposta',
  'components/pdf/RelatorioPulso', 'components/pdf/RelatorioComportamental',
];

/** Identificador de nota, média, score ou delta cru seguido de `.toFixed(`. */
export const PADRAO = /\b(?:nota|notas|media|mediaPre|mediaPos|average|score|delta|nota_\w+)\w*[\])?]*\.toFixed\(/;

function arquivosDoCliente(): string[] {
  const lista = (glob: string) => execFileSync('git', ['ls-files', glob], { encoding: 'utf8' }).split('\n').map((f) => f.trim()).filter(Boolean);
  // pathspec do git: `*` atravessa `/`, então "components/*.tsx" já é a árvore inteira (e inclui os da raiz)
  return [...lista('app/dashboard/*.tsx'), ...lista('components/*.tsx'), ...lista('lib/*.tsx')]
    .filter((f) => !FORA.some((p) => f === p || f.startsWith(`${p}/`) || f.startsWith(p)));
}

describe('guard: código do cliente sem nota decimal', () => {
  it('o padrão pega o que tem que pegar e deixa o resto', () => {
    for (const ruim of ['nota.toFixed(1)', '{notaPre.toFixed(2)}', 'item.nota?.toFixed(1)', 'g.media.toFixed(1)', 'r.nota_pos.toFixed(2)', 'delta.toFixed(2)', '(d.mediaPos).toFixed(1)']) {
      expect(PADRAO.test(ruim), ruim).toBe(true);
    }
    for (const bom of ['custoUsd.toFixed(4)', 'taxaRejeicao.toFixed(1)', 'x(index).toFixed(1)', 'formatarValorAvanco(delta)', 'avanco.toFixed(1)', 'pct.toFixed(0)']) {
      expect(PADRAO.test(bom), bom).toBe(false);
    }
  });

  it('o denominador existe: o guard está olhando as telas e os PDFs (e não uma lista vazia)', () => {
    const arquivos = arquivosDoCliente();
    // Medido em 04/10/2026: 132 arquivos. Um piso de 100 pega a lista que esvazia por erro de pathspec.
    expect(arquivos.length).toBeGreaterThan(100);
    for (const esperado of ['app/dashboard/gestor/page.tsx', 'components/pdf/RelatorioEvolucao.tsx', 'components/pdf/RelatorioIndividual.tsx', 'components/pdf/RelatorioRH.tsx', 'lib/dna-organizacional-pdf.tsx', 'app/dashboard/relatorios/relatorios-rh-view.tsx', 'components/simuladores/relatorio-competencias.tsx']) {
      expect(arquivos, esperado).toContain(esperado);
    }
    expect(arquivos.some((f) => f.startsWith('app/admin'))).toBe(false);
    // O ranking de preferências é do admin (média de preferência, não nota): vive onde o guard não varre.
    expect(arquivos).not.toContain('components/preferencias-ranking.tsx');
  });

  it('nenhuma tela ou PDF novo imprime nota; a dívida declarada só encolhe', () => {
    const achados: Record<string, number> = {};
    for (const arquivo of arquivosDoCliente()) {
      const texto = semComentarios(readFileSync(arquivo, 'utf8'));
      const n = texto.split('\n').filter((linha) => PADRAO.test(linha)).length;
      if (n) achados[arquivo] = n;
    }
    const novos = Object.keys(achados).filter((f) => (achados[f] ?? 0) > (ALLOWLIST[f] ?? 0));
    const velhos = Object.keys(ALLOWLIST).filter((f) => (achados[f] ?? 0) < ALLOWLIST[f]);
    expect(novos, `imprime nota decimal (use nível e formatarValorAvanco): ${JSON.stringify(achados, null, 1)}`).toEqual([]);
    expect(velhos, 'entrada da allowlist que já não acusa: remova-a').toEqual([]);
  });
});

describe('guard: texto do cliente sem "{nota} de 4" nem "nota média"', () => {
  const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
  // Lote 5b: a liderança ainda dizia "Média da jornada" e "sem média" (a mesma conta que o resto do
  // produto chama de "Nível geral"). "Nível médio" é a mesma média com outro nome.
  const PADRAO_TEXTO = /\{\w+\}\s*(?:de|of|out of|\/)\s*4(?:[.,]0)?\b|\bnota m[eé]dia\b|\baverage (?:score|grade)\b|\bm[eé]dia geral\b|\boverall average\b|\bm[eé]dia d[ao] jornada\b|\bsem m[eé]dia\b|\bn[ií]vel m[eé]dio\b|\bmedia del recorrido\b|\bsin promedio\b|\bnivel medio\b|\bjourney average\b|\bno average\b|\baverage level\b/i;
  const EXCLUIDOS = /^(?:Admin|Pulse|Radar)/;

  function* folhas(obj: any, caminho = ''): Generator<[string, unknown]> {
    for (const [k, v] of Object.entries(obj)) {
      if (v && typeof v === 'object') yield* folhas(v, `${caminho}${k}.`);
      else yield [`${caminho}${k}`, v];
    }
  }

  it('o padrão pega os textos de antes', () => {
    for (const velho of ['{score} de 4', '{score} out of 4', '{value} de 4.0', 'Nota média atual', 'Média geral:', 'Overall average:', 'Média da jornada: Nível {level}', 'sem média', 'Nível médio', 'Media del recorrido: Nivel {level}', 'sin promedio', 'Nivel medio', 'Journey average: Level {level}', 'no average', 'Average level']) {
      expect(PADRAO_TEXTO.test(velho), velho).toBe(true);
    }
    for (const bom of ['Nível geral', 'Nível {n}', '{count} de {total} competências', 'cobertura {coverage}%', 'Nível geral da jornada: {level}', 'Avanço médio', 'Overall journey level: {level}']) {
      expect(PADRAO_TEXTO.test(bom), bom).toBe(false);
    }
  });

  it.each(LOCALES)('%s', (locale) => {
    const mensagens = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
    const achados: string[] = [];
    for (const [chave, valor] of folhas(mensagens)) {
      if (EXCLUIDOS.test(chave)) continue;
      if (typeof valor === 'string' && PADRAO_TEXTO.test(valor)) achados.push(`${chave}: ${valor.slice(0, 80)}`);
    }
    expect(achados).toEqual([]);
  });
});
