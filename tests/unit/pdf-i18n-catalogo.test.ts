/**
 * Idioma dos PDFs (onda D, R-67 item 2): o catálogo `Pdf` e o tradutor que o papel usa.
 *
 * O que este arquivo trava:
 *  1. os quatro idiomas têm as MESMAS chaves e os MESMOS argumentos (um idioma que pede
 *     `{n}` e outro que não pede é texto que sai com buraco);
 *  2. nenhuma chave usada no código falta em algum idioma, e nenhuma chave do catálogo
 *     fica sem quem a use (config sem consumidor é promessa que ninguém cumpre);
 *  3. as chaves DINÂMICAS (código de criticidade, de urgência, de erro...) cobrem exatamente
 *     os códigos que o código emite, lidos da fonte e não digitados aqui;
 *  4. o tradutor cai no pt-BR (e avisa) em vez de imprimir o caminho da chave no papel;
 *  5. número, percentual e data seguem o `Intl` do idioma.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import {
  arredondarParaPdf, compararNomes, dataLongaNoPdf, dataNoPdf, idiomaDoPdf, numeroNoPdf, percentualNoPdf, tradutorDoPdf,
} from '@/lib/pdf-i18n';
import { CODIGOS_CRITICIDADE, CODIGOS_PRIORIDADE } from '@/components/pdf/RelatorioRH';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const catalogo = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8')).Pdf]),
) as Record<(typeof LOCALES)[number], any>;

function folhas(o: any, p = '', out: Array<[string, string]> = []): Array<[string, string]> {
  for (const [k, v] of Object.entries(o)) {
    const q = p ? `${p}.${k}` : k;
    if (typeof v === 'string') out.push([q, v]);
    else folhas(v, q, out);
  }
  return out;
}
// os três travessões, montados por código para o fonte não carregar o caractere
const TRAVESSAO = new RegExp('[' + [0x2013, 0x2014, 0x2015].map((c) => String.fromCharCode(c)).join('') + ']');
const mapa = Object.fromEntries(LOCALES.map((l) => [l, new Map(folhas(catalogo[l]))])) as Record<string, Map<string, string>>;

/** Os argumentos ICU de uma mensagem, em qualquer nível de aninhamento. */
const argumentos = (msg: string): string =>
  [...new Set([...msg.matchAll(/\{\s*([A-Za-z_]\w*)\s*(?=[,}])/g)].map((m) => m[1]))].sort().join(',');

describe('catálogo Pdf: quatro idiomas, as mesmas chaves e os mesmos argumentos', () => {
  it('existe nos quatro idiomas e tem o mesmo conjunto de chaves', () => {
    const base = [...mapa['pt-BR'].keys()].sort();
    expect(base.length).toBeGreaterThan(250);
    for (const l of LOCALES) expect([...mapa[l].keys()].sort(), l).toEqual(base);
  });

  it('cada chave pede os mesmos argumentos em todos os idiomas', () => {
    const divergentes: string[] = [];
    for (const [chave, pt] of mapa['pt-BR']) {
      for (const l of LOCALES) if (argumentos(mapa[l].get(chave)!) !== argumentos(pt)) divergentes.push(`${l}:${chave}`);
    }
    expect(divergentes).toEqual([]);
  });

  it('sem travessão, sem emoji, sem texto vazio e es-ES abre a exclamação', () => {
    for (const l of LOCALES) {
      for (const [chave, v] of mapa[l]) {
        expect(v.trim(), `${l}:${chave}`).not.toBe('');
        expect(v, `${l}:${chave}`).not.toMatch(TRAVESSAO);
        expect(v, `${l}:${chave}`).not.toMatch(/\p{Extended_Pictographic}/u);
        if (l === 'es-ES' && v.includes('!')) expect(v, `${l}:${chave}`).toContain('¡');
      }
    }
  });

  it('cada mensagem formata nos quatro idiomas com argumentos de verdade (ICU válido, plural e select incluídos)', () => {
    const valores = (msg: string) => Object.fromEntries(
      [...argumentos(msg).split(',').filter(Boolean)].map((a) => [a, /^(mode|changed|hasTotal|hasDate|audience)$/.test(a) ? 'no' : 3]),
    );
    for (const l of LOCALES) {
      const t = createTranslator({ locale: l, messages: { Pdf: catalogo[l] } as any, namespace: 'Pdf', onError: (e) => { throw e; } }) as any;
      for (const [chave, v] of mapa[l]) {
        const saida = t(chave, valores(v));
        expect(saida, `${l}:${chave}`).not.toMatch(/[{}]/);
        expect(saida.trim(), `${l}:${chave}`).not.toBe('');
      }
    }
  });
});

describe('catálogo Pdf: chave usada existe, chave existente é usada', () => {
  const ARQUIVOS = [
    'components/pdf/RelatorioIndividual.tsx', 'components/pdf/CompetencyBlock.tsx', 'components/pdf/RelatorioGestor.tsx',
    'components/pdf/RelatorioRH.tsx', 'components/pdf/RelatorioEngajamento.tsx', 'components/pdf/RelatorioEvolucao.tsx',
    'components/pdf/PdfReportCover.tsx', 'components/pdf/PdfCover.tsx',
    'lib/relatorios/rotulos-sem-dado.ts', 'app/dashboard/pdi/page.tsx',
  ];
  const fonte = (a: string) => readFileSync(a, 'utf8');

  // chaves literais: t('x.y') e tPdf('x.y')
  const estaticas = new Set<string>();
  // chaves montadas: t(`x.${y}`), que precisam estar na lista de famílias abaixo
  const montadas = new Set<string>();
  for (const a of ARQUIVOS) {
    const src = fonte(a);
    // a página do PDI tem o próprio `t` (namespace Pdi): dela só vale o `tPdf`
    const soTPdf = a === 'app/dashboard/pdi/page.tsx';
    const reLiteral = soTPdf ? /\btPdf\(\s*'([^'$]+)'/g : /\b(?:t|tPdf)\(\s*'([^'$]+)'/g;
    const reMontada = soTPdf ? /\btPdf\(\s*`([^`]+)`/g : /\b(?:t|tPdf)\(\s*`([^`]+)`/g;
    for (const m of src.matchAll(reLiteral)) estaticas.add(m[1]);
    for (const m of src.matchAll(reMontada)) montadas.add(m[1]);
  }

  /** Os códigos que o código EMITE, lidos da fonte. */
  const codigos = (arquivo: string, re: RegExp): string[] => [...new Set([...fonte(arquivo).matchAll(re)].map((m) => m[1]))].sort();
  const errosDoDownload = codigos('app/dashboard/pdi/pdi-actions.ts', /codigo: '([a-z_]+)'/g);

  const FAMILIAS: Record<string, string[]> = {
    'engajamento.series.${item.key}': ['activation', 'consumption', 'evidence'].map((k) => `engajamento.series.${k}`),
    'gestor.urgency.${chave}': ['conversa', 'alta', 'media', 'baixa'].map((k) => `gestor.urgency.${k}`),
    'rh.${familia}.${bruto}': [
      ...CODIGOS_CRITICIDADE.map((c) => `rh.criticality.${c}`), ...CODIGOS_PRIORIDADE.map((c) => `rh.priority.${c}`),
    ],
    'download.errors.${result.codigo}': errosDoDownload.map((c) => `download.errors.${c}`),
    'download.errors.${r.codigo}': errosDoDownload.map((c) => `download.errors.${c}`),
  };

  it('toda chave montada em tempo de execução tem uma família declarada (chave nova não passa em silêncio)', () => {
    // `${k}` do modelo do engajamento e os demais casos são os do FAMILIAS; qualquer padrão novo reprova aqui.
    expect([...montadas].filter((m) => !(m in FAMILIAS))).toEqual([]);
  });

  it('as famílias dinâmicas cobrem os códigos que o código emite (erros do download e códigos do RH)', () => {
    expect(errosDoDownload.sort()).toEqual([
      'colaborador_nao_encontrado', 'falha_gerar', 'falha_link', 'falha_salvar', 'nao_autenticado', 'pdi_nao_encontrado',
    ]);
    expect(CODIGOS_CRITICIDADE).toEqual(['CRITICA', 'ATENCAO', 'ESTAVEL']);
    expect(CODIGOS_PRIORIDADE).toEqual(['URGENTE', 'IMPORTANTE', 'DESEJAVEL']);
  });

  it('toda chave usada existe nos quatro idiomas', () => {
    const usadas = new Set<string>([...estaticas, ...Object.values(FAMILIAS).flat()]);
    // as chaves do PDI com prefixo próprio do PdfCover legado entram pelo mesmo caminho
    const faltando: string[] = [];
    for (const l of LOCALES) for (const k of usadas) if (!mapa[l].has(k)) faltando.push(`${l}:${k}`);
    expect(faltando).toEqual([]);
  });

  it('toda chave do catálogo tem quem a use (sem config sem consumidor)', () => {
    const usadas = new Set<string>([...estaticas, ...Object.values(FAMILIAS).flat()]);
    const orfas = [...mapa['pt-BR'].keys()].filter((k) => !usadas.has(k));
    expect(orfas).toEqual([]);
  });
});

describe('tradutorDoPdf', () => {
  it('traduz nos quatro idiomas e cai no pt-BR para idioma inválido ou ausente', () => {
    expect(tradutorDoPdf('pt-BR')('common.confidential')).toBe('Confidencial');
    expect(tradutorDoPdf('pt-PT')('engajamento.weeklyEngagement')).toBe('Envolvimento semanal');
    expect(tradutorDoPdf('es-ES')('individual.journeyN', { n: 2 })).toBe('Recorrido 2');
    expect(tradutorDoPdf('en-US')('individual.journeyN', { n: 2 })).toBe('Journey 2');
    expect(tradutorDoPdf('fr-FR')('common.confidential')).toBe('Confidencial');
    expect(tradutorDoPdf(undefined)('common.confidential')).toBe('Confidencial');
    expect(tradutorDoPdf(null)('common.confidential')).toBe('Confidencial');
    expect(idiomaDoPdf('en')).toBe('en-US');
    expect(idiomaDoPdf('pt-pt')).toBe('pt-PT');
  });

  it('plural em =1 e other, nos quatro idiomas (0 e 2 ficam no plural)', () => {
    const esperado: Record<string, [string, string, string]> = {
      'pt-BR': ['0 semanas', '1 semana', '2 semanas'],
      'pt-PT': ['0 semanas', '1 semana', '2 semanas'],
      'es-ES': ['0 semanas', '1 semana', '2 semanas'],
      'en-US': ['0 weeks', '1 week', '2 weeks'],
    };
    for (const l of LOCALES) {
      const t = tradutorDoPdf(l);
      expect([0, 1, 2].map((n) => t('individual.weeksCount', { n })), l).toEqual(esperado[l]);
    }
  });

  it('chave ausente NÃO imprime o caminho da chave: cai no pt-BR e avisa', () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      expect(tradutorDoPdf('en-US')('chave.que.nao.existe')).toBe('');
      expect(tradutorDoPdf('pt-BR')('chave.que.nao.existe')).toBe('');
      expect(erro).toHaveBeenCalled();
      expect(String(erro.mock.calls[0][0])).toContain('chave.que.nao.existe');
    } finally {
      erro.mockRestore();
    }
  });
});

describe('número, percentual e data pelo Intl do idioma', () => {
  it('uma casa decimal com a vírgula ou o ponto de cada idioma, sem separador de milhar', () => {
    expect(numeroNoPdf(3.5, 'pt-BR')).toBe('3,5');
    expect(numeroNoPdf(3.5, 'pt-PT')).toBe('3,5');
    expect(numeroNoPdf(3.5, 'es-ES')).toBe('3,5');
    expect(numeroNoPdf(3.5, 'en-US')).toBe('3.5');
    expect(numeroNoPdf(1234.56, 'pt-BR')).toBe('1234,6');
    expect(numeroNoPdf(0, 'en-US', 1)).toBe('0.0');
    expect(numeroNoPdf(7, 'es-ES', 0)).toBe('7');
  });

  it('arredondamento convencional sem o ruído do ponto flutuante', () => {
    expect(arredondarParaPdf(15.83 + 4.17)).toBe(20);
    expect(arredondarParaPdf(1.25)).toBe(1.3);
    expect(arredondarParaPdf(1.24)).toBe(1.2);
    expect(numeroNoPdf(1.25, 'pt-BR')).toBe('1,3');
  });

  it('percentual: "60%" em pt e en, com o espaço de es-ES; fração só com uma casa', () => {
    expect(percentualNoPdf(60, 'pt-BR')).toBe('60%');
    expect(percentualNoPdf(60, 'en-US')).toBe('60%');
    expect(percentualNoPdf(60, 'es-ES').replace(/\s/g, '')).toBe('60%');
    expect(percentualNoPdf(12.5, 'pt-BR')).toBe('12,5%');
    expect(percentualNoPdf(12.5, 'en-US')).toBe('12.5%');
    expect(percentualNoPdf(15.83 + 4.17, 'pt-BR')).toBe('20%');
  });

  it('data numérica por idioma, no fuso de Brasília (22h em São Paulo não vira o dia seguinte)', () => {
    // 2026-10-05T01:30Z = 04/10 22:30 em Brasília
    const iso = '2026-10-05T01:30:00Z';
    expect(dataNoPdf(iso, 'pt-BR')).toBe('04/10/2026');
    expect(dataNoPdf(iso, 'es-ES')).toBe('04/10/2026');
    expect(dataNoPdf(iso, 'en-US')).toBe('10/04/2026');
    expect(dataNoPdf(null, 'pt-BR')).toBe('');
    expect(dataNoPdf('lixo', 'pt-BR')).toBe('');
    expect(dataLongaNoPdf(iso, 'en-US')).toBe('October 04, 2026');
    expect(dataLongaNoPdf(iso, 'pt-BR')).toMatch(/04 de outubro de 2026/);
  });

  it('ordem alfabética pelo collator do idioma, sem acento nem caixa', () => {
    const nomes = ['bruno', 'Ágata', 'Zeca', 'ana'];
    expect([...nomes].sort((a, b) => compararNomes(a, b, 'pt-BR'))).toEqual(['Ágata', 'ana', 'bruno', 'Zeca']);
    expect([...nomes].sort((a, b) => compararNomes(a, b, 'es-ES'))).toEqual(['Ágata', 'ana', 'bruno', 'Zeca']);
    expect(compararNomes('Ålesund', 'Zeca', 'pt-BR')).toBeLessThan(0);
  });
});
