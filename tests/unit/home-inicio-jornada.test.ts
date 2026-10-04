import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inicioDaJornadaAindaFuturo, formatarInicioDaJornada } from '@/lib/home/inicio-jornada';

/**
 * R-86 (revisão de 02/10/2026): a home oferecia "Iniciar atividade de hoje" assim
 * que a trilha nascia, e a trilha nasce com início na PRÓXIMA segunda. Quem
 * clicava na quinta achava a semana 1 trancada. Agora o CTA diz quando começa.
 * A semana 1 abre na segunda às 03:00 de Brasília (06:00 UTC); as datas abaixo
 * ficam longe dessa borda.
 */
describe('inicioDaJornadaAindaFuturo', () => {
  const SEGUNDA = '2026-10-05';

  it('quinta antes da segunda de início: devolve a liberação da semana 1', () => {
    const r = inicioDaJornadaAindaFuturo(SEGUNDA, new Date('2026-10-01T15:00:00Z'));
    expect(r?.toISOString()).toBe('2026-10-05T06:00:00.000Z');
  });

  it('na segunda, depois das 03:00 de Brasília: já começou (null)', () => {
    expect(inicioDaJornadaAindaFuturo(SEGUNDA, new Date('2026-10-05T12:00:00Z'))).toBeNull();
  });

  it('domingo à noite em Brasília (segunda 02:00 UTC): ainda não começou', () => {
    expect(inicioDaJornadaAindaFuturo(SEGUNDA, new Date('2026-10-05T02:00:00Z'))).not.toBeNull();
  });

  it('sem data de início: não decide (null), o CTA fica o de sempre', () => {
    expect(inicioDaJornadaAindaFuturo(null, new Date('2026-10-01T15:00:00Z'))).toBeNull();
  });

  it('a data sai no fuso de Brasília e no idioma da pessoa', () => {
    const libera = new Date('2026-10-05T06:00:00Z');
    expect(formatarInicioDaJornada(libera, 'pt-BR')).toMatch(/segunda-feira.*05\/10/);
    expect(formatarInicioDaJornada(libera, 'en-US')).toMatch(/Monday/);
  });
});

/**
 * Onboarding (04/10/2026): a semana 1 é o Mapeamento, concluído, e a trilha nasce
 * com `data_inicio` UMA semana antes do início do conteúdo. "A semana que ainda
 * não abriu" é a primeira de CONTEÚDO (a 2): sem o plano a home diria que a
 * jornada já começou, e o CTA "Iniciar atividade de hoje" levaria à semana 2
 * trancada (o R-86 de novo, só no Onboarding).
 */
describe('inicioDaJornadaAindaFuturo: o plano do Onboarding', () => {
  // A trilha começa (a semana 2 abre) na segunda 12/10; data_inicio é a segunda anterior.
  const DATA_INICIO_GRAVADA = '2026-10-05';
  const PLANO_ONBOARDING = [{ semana: 1, tipo: 'mapeamento' }, { semana: 2, tipo: 'conteudo' }, { semana: 3, tipo: 'conteudo' }];
  const QUINTA = new Date('2026-10-08T15:00:00Z');

  it('antes da segunda de início, a data é a da semana 2 (e não a da semana 1, que já passou)', () => {
    const r = inicioDaJornadaAindaFuturo(DATA_INICIO_GRAVADA, QUINTA, PLANO_ONBOARDING);
    expect(r?.toISOString()).toBe('2026-10-12T06:00:00.000Z');
  });

  it('sem o plano (todo outro modo), a régua é a de sempre: a semana 1', () => {
    expect(inicioDaJornadaAindaFuturo(DATA_INICIO_GRAVADA, QUINTA)).toBeNull();
    expect(inicioDaJornadaAindaFuturo(DATA_INICIO_GRAVADA, QUINTA, [{ semana: 1, tipo: 'conteudo' }, { semana: 2, tipo: 'conteudo' }])).toBeNull();
  });

  it('na segunda 12/10 depois das 03:00 de Brasília, a semana 2 abriu: null', () => {
    expect(inicioDaJornadaAindaFuturo(DATA_INICIO_GRAVADA, new Date('2026-10-12T12:00:00Z'), PLANO_ONBOARDING)).toBeNull();
  });
});

describe('a home usa a régua (guard de fonte)', () => {
  it('o CTA principal troca "hoje" pela data quando a semana 1 ainda não abriu', () => {
    const f = readFileSync('app/dashboard/page.tsx', 'utf8');
    // Com o plano: no Onboarding quem espera é a semana 2, e a semana 1 (Mapeamento) já passou.
    expect(f).toMatch(/inicioDaJornadaAindaFuturo\(data\?\.temporada\?\.data_inicio, undefined, data\?\.temporada\?\.temporada_plano\)/);
    expect(f).toMatch(/inicioFuturo\s*\?\s*t\('mainCta\.startsOn'/);
  });
  it('a leitura da trilha da home traz data_inicio nos dois caminhos', () => {
    expect(readFileSync('lib/home/loaders.ts', 'utf8')).toMatch(/select\('competencia_foco, numero_temporada, status, temporada_plano, data_inicio'\)/);
    // Com o carimbo e o snapshot do programa depois (a duração da trilha, R-29).
    expect(readFileSync('app/dashboard/home-actions.ts', 'utf8')).toMatch(/criado_em, data_inicio(, programa_modo, programa_config)?'\)/);
  });
});

describe('"Análise em processamento" deixou de prometer o que não roda sozinho (R-86)', () => {
  it('a IA4 roda quando a equipe Vertho dispara: o texto diz isso nos 4 idiomas', () => {
    for (const loc of ['pt-BR', 'pt-PT', 'es-ES', 'en-US']) {
      const m = JSON.parse(readFileSync(`messages/${loc}.json`, 'utf8'));
      const txt: string = m.Assessment.done.analysisPending;
      expect(txt, loc).toMatch(/Vertho/);
      expect(txt, loc).not.toMatch(/processamento|en proceso|in progress/i);
    }
  });
});
