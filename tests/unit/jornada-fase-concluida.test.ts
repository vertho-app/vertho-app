import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * O card de uma fase CONCLUÍDA na jornada.
 *
 * O resultado do mapeamento de competências não tem porta própria: ele mora
 * atrás da fase 2 da jornada, que já era clicável e dizia apenas "concluída" —
 * sem descrição, sem seta, sem dizer o que havia do outro lado. Destino que não
 * se anuncia não é caminho, e foi assim que o dono não achou o resultado.
 *
 * O que pode regredir aqui, e por isso está preso: uma fase ganhar destino
 * (`FASE_HREF`) e ninguém escrever o texto que o anuncia — o card volta a ficar
 * mudo exatamente para a fase nova, e nada acusa.
 */

const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'];
const fonte = readFileSync('app/dashboard/jornada/page.tsx', 'utf8');

function fasesComDestino(): string[] {
  const bloco = fonte.slice(
    fonte.indexOf('const FASE_HREF'),
    fonte.indexOf('const PHASE_TOKENS'),
  );
  expect(bloco.length).toBeGreaterThan(0);
  return [...bloco.matchAll(/^\s*(\d+):\s*'/gm)].map((m) => m[1]);
}

describe('fase concluída na jornada', () => {
  it('toda fase com destino tem o texto que diz o que há atrás, nos 4 idiomas', () => {
    const fases = fasesComDestino();
    expect(fases.length).toBeGreaterThanOrEqual(5);

    for (const locale of LOCALES) {
      const msgs = JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
      const revisitar = msgs?.DashboardJourney?.timeline?.revisitar || {};
      for (const fase of fases) {
        expect(
          String(revisitar[fase] || '').trim().length,
          `${locale}: falta timeline.revisitar.${fase} — o card da fase ${fase} concluída fica mudo`,
        ).toBeGreaterThan(0);
      }
    }
  });

  it('o card concluído mostra o texto E a seta (não basta ser clicável)', () => {
    // a condição do texto
    expect(fonte).toMatch(/isDone && clickable[\s\S]{0,200}timeline\.revisitar/);
    // e a seta deixou de ser exclusiva da fase em curso
    expect(fonte).toMatch(/\(isCurrent \|\| \(isDone && clickable\)\) && \(\s*<ArrowRight/);
  });

  it('a fase 2 continua levando ao resultado do mapeamento', () => {
    const bloco = fonte.slice(fonte.indexOf('const FASE_HREF'), fonte.indexOf('const PHASE_TOKENS'));
    expect(bloco).toMatch(/2:\s*'\/dashboard\/assessment'/);
  });
});
