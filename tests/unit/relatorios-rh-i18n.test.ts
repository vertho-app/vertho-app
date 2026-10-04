/**
 * R-67 (04/10/2026), lote d-rh: o resto das telas do RH nos quatro idiomas.
 *
 * A home do RH escrevia a data da geração do relatório com `toLocaleDateString('pt-BR')`
 * e o percentual do funil como "{n}%" fixo; a leitura de evolução da central de relatórios
 * imprimia os valores de reserva do servidor ("Participante", "Competência") em português;
 * o cabeçalho de página (`PageHero`) tinha "Voltar" escrito no código.
 */
import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createElement } from 'react';
import { createTranslator } from 'next-intl';
import { CATALOGOS, portuguesEmIngles, renderizar, textoDe, textosEmPortugues, type Idioma } from '../helpers/i18n-render';
import { tEngajamento } from '../helpers/traducao-engajamento';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }),
  usePathname: () => '/dashboard/relatorios',
}));

import HomeRH from '@/app/dashboard/home-rh';
import { PageHero } from '@/components/page-shell';
import { EvolutionPanel, rotuloReserva } from '@/app/dashboard/relatorios/relatorios-rh-view';
import { PARTICIPANTE_SEM_NOME, COMPETENCIA_SEM_NOME } from '@/lib/relatorios/evolucao-rotulos';

describe('a fonte da home do RH, da central de relatórios e do cabeçalho não tem texto fixo em português', () => {
  it.each(['app/dashboard/home-rh.tsx', 'app/dashboard/relatorios/relatorios-rh-view.tsx', 'components/page-shell.tsx'])('%s', (arquivo) => {
    expect(textosEmPortugues(arquivo)).toEqual([]);
  });

  it('a data não é mais "pt-BR" escrito no código da home', () => {
    const codigo = readFileSync('app/dashboard/home-rh.tsx', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|\s)\/\/\s.*$/gm, '');
    expect(codigo).not.toMatch(/toLocale\w*String\('pt-BR'|DateTimeFormat\('pt-BR'/);
  });
});

describe('cabeçalho de página: o "Voltar" sai no idioma', () => {
  it.each([['pt-BR', 'Voltar'], ['pt-PT', 'Voltar'], ['es-ES', 'Volver'], ['en-US', 'Back']] as const)('%s', (idioma, esperado) => {
    const texto = textoDe(renderizar(idioma, createElement(PageHero, { title: 'T' })));
    expect(texto).toMatch(new RegExp(`(^|[^\\p{L}])${esperado}([^\\p{L}]|$)`, 'u'));
  });
  it('en-US não diz "Voltar"', () => {
    expect(textoDe(renderizar('en-US', createElement(PageHero, { title: 'T' })))).not.toContain('Voltar');
  });
});

describe('home do RH: data e percentuais no formato do idioma', () => {
  const panorama = { empresaNome: 'Acme', pessoas: 8, comPerfil: 8, comMapeamento: 4, emJornada: 2, emDia: 1, atrasadas: 1, jornadasEncerradas: 0, indisponivel: false };
  const relatorios = { rh: { url: '/x', em: '2026-10-04T15:00:00Z' }, perfilOrg: null, dna: null };
  const html = (idioma: Idioma) => renderizar(idioma, createElement(HomeRH, { firstName: 'Rita', panorama, relatorios }));

  it('a data da geração do relatório segue o idioma (era toLocaleDateString pt-BR fixo)', () => {
    expect(textoDe(html('pt-BR'))).toContain('04/10/2026');
    expect(textoDe(html('en-US'))).toContain('10/04/2026');
  });

  it('o percentual do funil sai pelo Intl do idioma (es-ES separa o %)', () => {
    expect(textoDe(html('pt-BR'))).toContain('100%');
    expect(html('es-ES')).toMatch(/100[\s ]%/);
    expect(html('es-ES')).not.toMatch(/>100%</);
  });

  it('en-US sem português na home', () => {
    expect(portuguesEmIngles(html('en-US')).filter((p) => !/^(Acme|Rita)$/.test(p))).toEqual([]);
  });
});

describe('central de relatórios: leitura de evolução com valores de reserva do servidor', () => {
  const evolucaoTela = {
    indisponivel: false,
    cobertura: { medidos: 1, emJornada: 1, participantes: 2, percentual: 50 },
    resumo: { confirmadas: 0, parciais: 1, estaveis: 0, deltaMedio: 0.5 },
    porCompetencia: [{ chave: COMPETENCIA_SEM_NOME, n: 1, nivelPre: 1, nivelPos: 2, delta: 1, competencia: null }],
    porDescritor: [],
    pessoas: [{
      colaboradorId: 'c1', nome: PARTICIPANTE_SEM_NOME, cargo: null, area: null, competencia: COMPETENCIA_SEM_NOME, n: 2,
      nivelPre: 1, nivelPos: 2, delta: 1, veredito: 'evolucao_parcial', sustentacao: 'media', proximoPasso: null, concluidoEm: '2026-10-01',
    }],
    proximasAcoes: { precisamApoio: [], proximoCiclo: [] },
  };
  const reports: any = { scope: { turmaId: null, turmas: [], pessoasEmpresa: 2, insightScopeIsCompany: false }, dashboard: { evolucao: evolucaoTela } };
  const html = (idioma: Idioma) => renderizar(idioma, createElement(EvolutionPanel, { reports, t: createTranslator({ locale: idioma, messages: CATALOGOS[idioma], namespace: 'RhReports' }) }));

  it.each([['pt-BR', 'Participante', 'Competência'], ['pt-PT', 'Participante', 'Competência'], ['es-ES', 'Participante', 'Competencia'], ['en-US', 'Participant', 'Competency']] as const)(
    '%s: o nome e a competência de reserva saem no idioma', (idioma, pessoaEsperada, competenciaEsperada) => {
      const texto = textoDe(html(idioma));
      // palavra inteira: "Participant" é prefixo de "Participante", e o teste não pode passar pelo prefixo
      expect(texto).toMatch(new RegExp(`(^|[^\\p{L}])${pessoaEsperada}([^\\p{L}]|$)`, 'u'));
      expect(texto).toMatch(new RegExp(`(^|[^\\p{L}])${competenciaEsperada}([^\\p{L}]|$)`, 'u'));
    });

  it('en-US sem português na aba de evolução, inclusive nos valores de reserva', () => {
    expect(portuguesEmIngles(html('en-US'))).toEqual([]);
  });

  it('o rótulo só troca o valor de reserva exato: um nome real passa intacto', () => {
    const t = tEngajamento('en-US');
    expect(rotuloReserva('Participante', t)).toBe('Participant');
    expect(rotuloReserva('Competência', t)).toBe('Competency');
    expect(rotuloReserva('Maria Participante', t)).toBe('Maria Participante');
    expect(rotuloReserva('Liderança', t)).toBe('Liderança');
  });
});

