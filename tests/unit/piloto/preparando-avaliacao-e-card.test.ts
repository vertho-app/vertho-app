import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { leituraDoStatusDaAcumulada } from '@/lib/season-engine/trilha-runtime';
import { relatorioMedeEvolucao } from '@/lib/season-engine/convergencia';

/**
 * R-102 (04/10/2026): duas telas dos formatos curtos (Piloto e Personalizado).
 *
 *  1. A lista da temporada mostrava cada comportamento como "Estável" mesmo
 *     quando o relatório guarda só o ponto de partida (sem nota de chegada),
 *     um veredito de evolução que ninguém mediu.
 *  2. Se a acumulada falhava, o wizard do fechamento ficava em "Preparando sua
 *     avaliação" para sempre (texto fixo em pt-BR), e só recarregar destravava.
 *
 * As telas são componentes de cliente: a régua testável está nas funções puras
 * e o que sobra é amarrado por leitura do código (o que a pessoa vê, só a
 * imagem prova: ver o relatório do lote).
 */

// CRLF no disco do Windows e LF no checkout do CI: o teste lê as duas do mesmo jeito.
const ler = (caminho: string) => readFileSync(caminho, 'utf-8').split('\r\n').join('\n');
const PAGINA_FECHAMENTO = ler('app/dashboard/temporada/sem14/page.tsx');
const PAGINA_LISTA = ler('app/dashboard/temporada/page.tsx');
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];

describe('leituraDoStatusDaAcumulada', () => {
  it('done: pronto; error: falhou; processing ou ausente: aguardando', () => {
    expect(leituraDoStatusDaAcumulada('done')).toBe('pronto');
    expect(leituraDoStatusDaAcumulada('error')).toBe('falhou');
    expect(leituraDoStatusDaAcumulada('processing')).toBe('aguardando');
    expect(leituraDoStatusDaAcumulada(null)).toBe('aguardando');
    expect(leituraDoStatusDaAcumulada(undefined)).toBe('aguardando');
  });
});

describe('wizard do fechamento: acumulada que falha', () => {
  it('o acompanhamento lê o status pela régua e PARA quando falhou', () => {
    expect(PAGINA_FECHAMENTO).toContain("leituraDoStatusDaAcumulada(s.acumulada_status)");
    expect(PAGINA_FECHAMENTO).toMatch(/leitura === 'falhou'\) \{ setPreparandoFalhou\(true\); return; \}/);
  });

  it('esgotar o acompanhamento sem resposta também cai no aviso, em vez de girar para sempre', () => {
    expect(PAGINA_FECHAMENTO).toMatch(/if \(pollRef\.current\) setPreparandoFalhou\(true\);/);
  });

  it('o aviso oferece "Tentar de novo", que reabre o fechamento (o init re-dispara a acumulada)', () => {
    expect(PAGINA_FECHAMENTO).toMatch(/onClick=\{\(\) => doInit\(trilhaId, semCenarioB\)\}/);
    expect(PAGINA_FECHAMENTO).toContain("t('preparing.retry')");
  });

  it('o texto da espera não é mais fixo em pt-BR', () => {
    expect(PAGINA_FECHAMENTO).not.toContain('Preparando sua avaliação');
    expect(PAGINA_FECHAMENTO).not.toContain('Estamos consolidando');
    expect(PAGINA_FECHAMENTO).toContain("t('preparing.title')");
  });

  it.each(LOCALES)('%s traz as cinco chaves de `SeasonFinal.preparing`', (loc) => {
    const preparing = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8')).SeasonFinal.preparing;
    for (const k of ['title', 'body', 'failedTitle', 'failedBody', 'retry']) {
      expect(typeof preparing[k], `${loc}: ${k}`).toBe('string');
      expect(preparing[k].length).toBeGreaterThan(5);
      expect(preparing[k]).not.toMatch(/[–—]/);
    }
  });
});

describe('lista da temporada: relatório sem nota de chegada não vira "Estável"', () => {
  it('a régua: piloto e Personalizado sem fechamento não medem evolução; o relatório regular mede', () => {
    expect(relatorioMedeEvolucao({ modo: 'piloto' })).toBe(false);
    expect(relatorioMedeEvolucao({ modo: 'sem_fechamento', sem_fechamento: true })).toBe(false);
    expect(relatorioMedeEvolucao({ modo: 'regular' })).toBe(true);
  });

  it('o card consulta a régua ANTES de desenhar o veredito por comportamento', () => {
    const card = PAGINA_LISTA.slice(PAGINA_LISTA.indexOf('function EvolutionReportCard'));
    const posRegua = card.indexOf('!relatorioMedeEvolucao(report)');
    const posVeredito = card.indexOf('t(\'report.stable\')');
    expect(posRegua).toBeGreaterThan(-1);
    expect(posVeredito).toBeGreaterThan(posRegua);
  });

  it('a variante sem medição não escreve veredito nem avanço por comportamento', () => {
    const card = PAGINA_LISTA.slice(PAGINA_LISTA.indexOf('function EvolutionReportCard'));
    const variante = card.slice(card.indexOf('!relatorioMedeEvolucao(report)'), card.indexOf('return (\n    <GlassCard', card.indexOf('!relatorioMedeEvolucao(report)') + 20));
    expect(variante).toContain("t('report.notMeasured')");
    expect(variante).not.toContain('report.stable');
    expect(variante).not.toContain('formatarAvanco');
  });

  it.each(LOCALES)('%s traz `Season.report.notMeasured` e `Season.report.worked`', (loc) => {
    const report = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf-8')).Season.report;
    expect(report.notMeasured.length).toBeGreaterThan(20);
    expect(report.worked.length).toBeGreaterThan(5);
    expect(report.notMeasured).not.toMatch(/[–—]/);
  });
});
