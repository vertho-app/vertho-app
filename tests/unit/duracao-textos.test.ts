import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createTranslator } from 'next-intl';
import { descricaoDaFase } from '@/lib/home/fase-descricao';

/**
 * R-27, R-29, R-30 e R-26 (revisão de 02/10/2026): os TEXTOS que dizem a
 * duração e o formato, nos 4 idiomas.
 *
 *  - R-27: as descrições de fase da home estavam deslocadas uma posição, e a da
 *    Temporada dizia "14 semanas" para todos (a do PDI, na verdade);
 *  - R-29: a conversa qualitativa dizia "nessas 12 semanas" escrito à mão;
 *  - R-30: o topo da temporada dizia "N semanas para evoluir 1 competência" no
 *    Onboarding (5) e no DUO (2);
 *  - R-26: a tela de configuração usava a palavra "DUO" em dois sentidos (o
 *    formato de 14 semanas e as "semanas DUO" da cadência) e citava o Regular
 *    como se fosse o modo corrente.
 */

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const mensagens = Object.fromEntries(
  LOCALES.map((l) => [l, JSON.parse(readFileSync(`messages/${l}.json`, 'utf-8'))]),
) as Record<(typeof LOCALES)[number], any>;

const tradutor = (locale: (typeof LOCALES)[number], namespace: string) =>
  createTranslator({ locale, messages: mensagens[locale], namespace, onError: () => {} });

describe('R-27: a descrição da fase acompanha a fase', () => {
  it('cada fase tem a SUA descrição (Perfil, Avaliação, PDI, Temporada, Reavaliação)', () => {
    const chaves = [1, 2, 3, 4, 5].map((faseNum) =>
      descricaoDaFase({ faseNum, perfilBloqueado: false, semanasDaTemporada: 7 }).chave);
    expect(chaves).toEqual(['1', '2', '3', '4', '5']);
  });

  it('🔴 só a Temporada leva o número de semanas, e é o do programa da pessoa', () => {
    expect(descricaoDaFase({ faseNum: 4, perfilBloqueado: false, semanasDaTemporada: 7 })).toEqual({ chave: '4', weeks: 7 });
    expect(descricaoDaFase({ faseNum: 4, perfilBloqueado: false, semanasDaTemporada: 10 })).toEqual({ chave: '4', weeks: 10 });
    expect(descricaoDaFase({ faseNum: 3, perfilBloqueado: false, semanasDaTemporada: 7 }).weeks).toBeUndefined();
  });

  it('Temporada sem trilha montada não inventa o total: "trilha sendo montada"', () => {
    expect(descricaoDaFase({ faseNum: 4, perfilBloqueado: false, semanasDaTemporada: null })).toEqual({ chave: 'trailBuilding' });
    expect(descricaoDaFase({ faseNum: 4, perfilBloqueado: false, semanasDaTemporada: 0 })).toEqual({ chave: 'trailBuilding' });
  });

  it('Perfil ainda não liberado pelo RH: diz que aguarda, em vez de mandar responder', () => {
    expect(descricaoDaFase({ faseNum: 1, perfilBloqueado: true, semanasDaTemporada: null })).toEqual({ chave: 'profileWaiting' });
  });

  it('fase desconhecida cai no texto genérico', () => {
    expect(descricaoDaFase({ faseNum: 9, perfilBloqueado: false, semanasDaTemporada: 7 })).toEqual({ chave: 'fallback' });
  });

  it.each(LOCALES)('%s: todas as chaves existem e só a Temporada tem {weeks}', (locale) => {
    const d = mensagens[locale].DashboardHome.phaseDescriptions;
    for (const chave of ['1', '2', '3', '4', '5', 'trailBuilding', 'profileWaiting', 'fallback']) {
      expect(typeof d[chave], `${locale} sem ${chave}`).toBe('string');
    }
    expect(d['4']).toContain('{weeks}');
    for (const chave of ['1', '2', '3', '5', 'trailBuilding', 'profileWaiting', 'fallback']) {
      expect(d[chave]).not.toContain('{weeks}');
    }
    // Nenhum texto de fase crava um número de semanas: ele vem do programa.
    for (const [chave, texto] of Object.entries<string>(d)) {
      expect(texto, `${locale}.${chave}`).not.toMatch(/\b14\b/);
    }
    // A jornada (a outra tela das mesmas fases) ganhou a variante sem trilha.
    expect(typeof mensagens[locale].DashboardJourney.phaseDescriptions.trailPending).toBe('string');
  });

  it.each(LOCALES)('%s: a Temporada renderiza o número do programa', (locale) => {
    const t = tradutor(locale, 'DashboardHome');
    expect(t('phaseDescriptions.4', { weeks: 7 })).toContain('7');
    expect(t('phaseDescriptions.4', { weeks: 10 })).toContain('10');
  });
});

describe('R-30: o topo da temporada diz quantas competências a trilha trabalha', () => {
  const render = (locale: (typeof LOCALES)[number], chave: string, weeks: number, count: number) =>
    (tradutor(locale, 'Season') as any).markup(chave, {
      weeks, count, evolve: (c: string) => c, level: (c: string) => c,
    }) as string;

  it.each(LOCALES)('%s: 1 competência no singular, N no plural, semanas no plural', (locale) => {
    const um = render(locale, 'hero.subtitle', 7, 1);
    const cinco = render(locale, 'hero.subtitle', 10, 5);
    expect(um).toMatch(/\b1\b/);
    expect(cinco).toMatch(/\b5\b/);
    expect(cinco).toMatch(/\b10\b/);
    // "1 semanas" era o texto do Personalizado de uma semana.
    expect(render(locale, 'hero.subtitle', 1, 1)).not.toMatch(/\b1 (semanas|weeks)\b/);
  });

  it.each(LOCALES)('%s: a variante da degustação não promete evolução', (locale) => {
    const frase = render(locale, 'hero.subtitlePilot', 2, 1);
    expect(frase).not.toMatch(/evolu|evolve/i);
    expect(frase).toMatch(/\b2\b/);
  });
});

describe('R-29: a conversa qualitativa diz as semanas do plano', () => {
  it.each(LOCALES)('%s: {weeks} no lugar do 12 escrito à mão', (locale) => {
    const bruto: string = mensagens[locale].SeasonWeek.qualitative.description;
    expect(bruto).toContain('{weeks}');
    expect(bruto).not.toMatch(/\b12\b/);
    const t = tradutor(locale, 'SeasonWeek');
    expect(t('qualitative.description', { weeks: 7 })).toMatch(/\b7\b/);
  });
});

describe('R-30: o wizard da avaliação final não nomeia uma semana que o programa não tem', () => {
  it.each(LOCALES)('%s: rótulo sem número de semana para o fechamento que herda calendário', (locale) => {
    const t = tradutor(locale, 'SeasonFinal');
    const rotulo = t('progress.finalCompetency', { competency: 'Escuta' });
    expect(rotulo).toContain('Escuta');
    expect(rotulo).not.toMatch(/\d/);
  });
});

describe('admin: o card do plano diz o tamanho do plano', () => {
  it.each(LOCALES)('%s: planTitle leva {weeks}', (locale) => {
    expect(mensagens[locale].AdminSeasons.card.planTitle).toContain('{weeks}');
    expect(tradutor(locale, 'AdminSeasons')('card.planTitle', { weeks: 7 })).toMatch(/\b7\b/);
  });
});

describe('R-26: a tela de configuração do formato', () => {
  const programa = (locale: (typeof LOCALES)[number]) => mensagens[locale].AdminCompanySettings.program;

  it.each(LOCALES)('%s: os formatos OFERECIDOS não usam a palavra DUO nem citam o Regular como corrente', (locale) => {
    const p = programa(locale);
    for (const chave of ['journey', 'journeyDesc', 'onboarding', 'onboardingDesc', 'custom', 'customDesc', 'careerHint']) {
      expect(p[chave], `${locale}.program.${chave}`).not.toMatch(/\bDUO\b|\bRegular\b/);
    }
  });

  it.each(LOCALES)('%s: a Jornada diz o que acontece ao concluir (a próxima competência começa sozinha)', (locale) => {
    expect(programa(locale).journeyDesc).toMatch(/\b6\b/);
    expect(programa(locale).journeyDesc.length).toBeGreaterThan(60);
  });

  it.each(LOCALES)('%s: o texto da cadência é do i18n e não fala em "semanas DUO"', (locale) => {
    const c = mensagens[locale].AdminCompanySettings.cadence;
    expect(c.pill2Day).not.toMatch(/DUO/);
    expect(typeof c.note).toBe('string');
    expect(c.note).not.toMatch(/DUO|4, 8, 12|\b4\/8\/12\b/);
  });

  it('a tela não tem mais o texto da cadência escrito à mão', () => {
    const fonte = readFileSync('app/admin/empresas/[empresaId]/configuracoes/page.tsx', 'utf-8');
    expect(fonte).not.toMatch(/semanas DUO/);
    expect(fonte).toContain("t('cadence.note')");
  });

  it.each(LOCALES)('%s: o blueprint diz que a chave é só do formato descontinuado', (locale) => {
    expect(programa(locale).blueprintDesc).toMatch(/Regular DUO/);
    expect(programa(locale).blueprintDesc).toMatch(/Jornada|Journey/);
  });
});
