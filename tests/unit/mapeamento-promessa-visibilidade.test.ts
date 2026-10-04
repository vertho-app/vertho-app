import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * R-07 (04/10/2026): antes de a pessoa responder o mapeamento, a tela dizia
 * "Confidencial: RH vê apenas dados agregados". O RH vê a jornada individual e o
 * nível de cada pessoa da empresa (`canViewColabJourney`, a central do RH e a
 * Evolução da equipe), então a frase era falsa e a pessoa respondia sob uma
 * promessa que o produto não cumpre. O texto agora diz o que é verdade: quem
 * acompanha e o que essa pessoa vê (o nível por competência).
 *
 * O guard lê os 4 idiomas porque o erro estava em todos.
 */
const LOCALES = ['pt-BR', 'pt-PT', 'es-ES', 'en-US'] as const;
const explicacao = (locale: string) =>
  JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8')).Assessment.explanation;

describe('o aviso de visibilidade do mapeamento é verdadeiro', () => {
  it.each(LOCALES)('%s: não promete "agregado" nem "confidencial"', (locale) => {
    const { confidentialTitle, confidentialText } = explicacao(locale);
    const tudo = `${confidentialTitle} ${confidentialText}`;
    expect(tudo).not.toMatch(/agregad|aggregat|confidenc|confidenti|apenas dados|solo datos|only sees/i);
  });

  it.each(LOCALES)('%s: diz quem vê e o quê (RH e liderança veem o nível)', (locale) => {
    const { confidentialText } = explicacao(locale);
    expect(confidentialText).toMatch(/RH|HR|RR\. ?HH\./);
    expect(confidentialText).toMatch(/n[ií]vel|nivel|level/i);
    expect(confidentialText).toMatch(/lideran|manager|liderazgo/i);
  });

  it('a tela continua lendo as duas chaves (trocar a chave sem trocar a tela deixaria a frase velha)', () => {
    const tela = readFileSync('app/dashboard/assessment/page.tsx', 'utf8');
    expect(tela).toContain("t('explanation.confidentialTitle')");
    expect(tela).toContain("t('explanation.confidentialText')");
  });
});
