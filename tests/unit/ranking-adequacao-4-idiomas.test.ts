/**
 * R-67 (04/10/2026): o Ranking de Adequação ao Cargo (tela do RH) só falava português, e o erro da action vinha
 * como frase. Aqui a tela é montada JÁ carregada nos 4 idiomas: o texto de cada idioma chega, o número e a data
 * saem pelo Intl do idioma, o rótulo de bloco que o snapshot grava em português é traduzido, e em en-US e es-ES
 * não sobra português. O nome de pessoa e de cargo, e "A desenvolver", são dado: os fixtures os escrevem em inglês.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NextIntlClientProvider } from 'next-intl';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, back: () => {}, replace: () => {}, refresh: () => {} }),
  usePathname: () => '/dashboard/gestor/ranking',
  useSearchParams: () => new URLSearchParams(),
}));

import RankingAdequacaoView from '@/components/ranking-adequacao-view';

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const MENSAGENS: Record<string, any> = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf8'))]),
);
const montar = (locale: string, dadosIniciais: any, extra: any = {}): string =>
  renderToStaticMarkup(createElement(NextIntlClientProvider, {
    locale, messages: MENSAGENS[locale], timeZone: 'America/Sao_Paulo',
    children: createElement(RankingAdequacaoView, { listar: async () => ({ cargos: [] }), carregar: async () => ({}), dadosIniciais, ...extra }),
  }));
const texto = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/\s+/g, ' ');

const DADOS = (extra: any = {}) => ({
  cargos: ['Teacher', 'Coordinator'],
  sel: 'Teacher',
  data: {
    success: true, cargo: 'Teacher', dataISO: '2026-10-03T12:00:00Z', temTracos: true,
    eixo: { bloco: 'DISC', label: 'DISC', peso: 40 },
    faixas: { ressalvasMin: 60 },
    divergencia: { eixo: 'Competência', sdEixo: 2.1, real: 'Liderança' },
    elegiveis: [
      { id: 'p1', nome: 'Ana Souza', status: 'recomendado', aderencia: 92.43, borderline: true, semDelta: 3.1, blocos: { 'Liderança': 80, 'Competência': 70 }, drivers: ['Planning', 'Listening'] },
      { id: 'p2', nome: 'Bia Lima', status: 'recomendado_com_ressalvas', aderencia: 71.06, borderline: false, semDelta: 0, blocos: { 'Liderança': null, 'Competência': 60 }, drivers: [] },
      { id: 'p3', nome: 'Caio Dias', status: 'abaixo_do_corte', aderencia: 40, borderline: false, semDelta: 0, blocos: { 'Liderança': 30, 'Competência': 50 }, drivers: ['Delegation'] },
    ],
    anexoGate: [{ id: 'g1', nome: 'Duda Reis', gates: ['Requirement 2 < 3'], origem: 'Origin' }],
    totais: { elegiveis: 3, bloqueados: 1 },
    ...extra,
  },
});

// Só palavra que NÃO existe em espanhol nem em inglês ("ordenar", "corte" e "cabe" existem em espanhol).

// Só palavra que NÃO existe em espanhol nem em inglês ("ordenar", "corte" e "cabe" existem em espanhol).
const PALAVRAS_PT = /\b(não|nao|você|decisão|nenhum\w*|ainda|aderência|ressalvas|abaixo|filtro|liderança|competência|pessoas?|mapeamento comportamental)\b/i;

describe('Ranking de Adequação, nos 4 idiomas', () => {
  const FRASES: Record<string, { titulo: string; apoio: string; separa: string; gate: string; contagem: string; status: string }> = {
    'pt-BR': { titulo: 'Ranking de Adequação ao Cargo', apoio: 'A decisão final cabe ao gestor ou ao RH.', separa: 'Liderança (separa)', gate: 'Fora do ranking por requisito essencial (1)', contagem: '3 de 3 no ranking', status: 'Com ressalvas' },
    'pt-PT': { titulo: 'Ranking de Adequação ao Cargo', apoio: 'A decisão final cabe ao gestor ou aos RH.', separa: 'Liderança (separa)', gate: 'Fora do ranking por requisito essencial (1)', contagem: '3 de 3 no ranking', status: 'Com ressalvas' },
    'es-ES': { titulo: 'Ranking de adecuación al cargo', apoio: 'La decisión final corresponde al gestor o a RR. HH.', separa: 'Liderazgo (separa)', gate: 'Fuera del ranking por requisito esencial (1)', contagem: '3 de 3 en el ranking', status: 'Con reservas' },
    'en-US': { titulo: 'Job Fit Ranking', apoio: 'The final decision belongs to the manager or to HR.', separa: 'Leadership (separates)', gate: 'Outside the ranking because of an essential requirement (1)', contagem: '3 of 3 in the ranking', status: 'With reservations' },
  };

  it.each(LOCALES)('%s: título, apoio à decisão, ordenação, anexo de requisito e contagem', (locale) => {
    const t = texto(montar(locale, DADOS()));
    for (const [chave, frase] of Object.entries(FRASES[locale])) expect(t, `${locale}: ${chave}`).toContain(frase);
  });

  it('número e data saem pelo Intl do idioma: vírgula e dia/mês em pt, ponto e mês/dia em en, espaço antes do % em es', () => {
    expect(texto(montar('pt-BR', DADOS()))).toContain('92,4%');
    expect(texto(montar('pt-BR', DADOS()))).toContain('03/10/2026');
    expect(texto(montar('en-US', DADOS()))).toContain('92.4%');
    expect(texto(montar('en-US', DADOS()))).toContain('10/03/2026');
    expect(texto(montar('es-ES', DADOS()))).toMatch(/92,4\s%/);
    expect(texto(montar('es-ES', DADOS()))).toContain('03/10/2026');
    // o peso do eixo e a faixa de corte também (era "peso 40%" e "< 60%" escritos à mão)
    expect(texto(montar('en-US', DADOS()))).toContain('(weight 40%)');
    expect(texto(montar('en-US', DADOS()))).toContain('fit below 60%');
  });

  it('o rótulo de bloco que o snapshot grava em português é traduzido; rótulo desconhecido segue como veio', () => {
    const en = texto(montar('en-US', DADOS()));
    // o bloco que separa (Liderança) e o eixo que não separa (DISC, rotulado "Mapeamento Comportamental")
    expect(en).toContain('Leadership: 80%');
    expect(en).toContain('Behavioral mapping: n/a');
    expect(en).toContain('Competency'); // na frase da divergência
    expect(texto(montar('es-ES', DADOS()))).toContain('Liderazgo: 80 %');
    const novo = texto(montar('en-US', DADOS({ divergencia: null, eixo: { bloco: 'X', label: 'Custom block', peso: null }, elegiveis: [{ id: 'p', nome: 'Ana Souza', status: 'recomendado', aderencia: 80, borderline: false, semDelta: 0, blocos: { 'Custom block': 55 }, drivers: [] }], totais: { elegiveis: 1, bloqueados: 0 } })));
    expect(novo).toContain('Custom block: 55%');
    expect(novo).toContain('Custom block (axis)');
  });

  it('a legenda das faixas não usa emoji (a cor é uma bolinha) e nenhum idioma usa travessão', () => {
    for (const locale of LOCALES) {
      const html = montar(locale, DADOS());
      expect(html, locale).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(texto(html), locale).not.toMatch(/[–—]/);
    }
  });

  it.each(['es-ES', 'en-US'])('%s: não sobra português (nem na lista, nem no anexo, nem na legenda)', (locale) => {
    // "Ana Souza" etc. são dado do banco; o resto é texto da tela
    const t = texto(montar(locale, DADOS()));
    expect(t.match(new RegExp(PALAVRAS_PT.source, 'gi')) || [], locale).toEqual([]);
    expect(t).not.toMatch(/[ãõç]/i);
    if (locale === 'en-US') expect(t).not.toMatch(/[áéíóúâêô]/i);
  });

  it('sem cargo com ranking, a tela diz isso no idioma; o PDF aberto tem leitor e botão de voltar traduzidos', () => {
    expect(texto(montar('en-US', { cargos: [], sel: '', data: null }))).toContain('No role has a ranking yet.');
    expect(texto(montar('es-ES', { cargos: [], sel: '', data: null }))).toContain('Aún no hay ningún cargo con ranking generado.');
    const pdf = texto(montar('en-US', { ...DADOS(), pdfUrl: 'https://example.test/x.pdf' }));
    expect(pdf).toContain('Back to the ranking');
    expect(pdf).toContain('Report viewer');
    expect(pdf).toContain('Job fit ranking · Teacher');
  });

  it('o botão de PDF diz "Visualizar PDF" no idioma (só aparece quando a tela recebe `exportar`)', () => {
    const exportar = async () => ({ success: true, url: 'x' });
    expect(texto(montar('pt-BR', DADOS(), { exportar }))).toContain('Visualizar PDF');
    expect(texto(montar('en-US', DADOS(), { exportar }))).toContain('View PDF');
    expect(texto(montar('en-US', DADOS()))).not.toContain('View PDF');
  });
});
