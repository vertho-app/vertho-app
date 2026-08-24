import { describe, it, expect } from 'vitest';
import { assinaturaCurta } from '@/lib/escola-brief';

/**
 * F-E7 + F-I10 no PDF personalizado.
 *
 * O PDF resolvia o PPP com `.eq('empresa_id').order('extracted_at' desc).limit(1)`:
 * numa empresa-rede isso pega o PPP de UMA escola sorteada pela data e aplica à rede
 * inteira. Medido em 27/07: Ibipeba tem 11 PPPs para 13 escolas e 54 pessoas — todas
 * recebiam a lente de uma escola arbitrária, em silêncio (nada erra; o conteúdo só
 * fica calibrado na escola errada). Corrigido usando `resolverContextoEmpresa`, o
 * mesmo resolvedor do Kit — sem isso, a mesma pessoa teria o PDF numa lente e o kit
 * noutra para o mesmo tema.
 *
 * O cache era por (conteúdo, empresa, arquétipo), sem nada do contexto. Duas
 * consequências: PPP novo não invalidava o PDF antigo, e uma resolução por-escola
 * faria duas pessoas de escolas diferentes colidirem na mesma chave. A assinatura do
 * contexto na chave fecha as duas.
 */
describe('assinaturaCurta · discriminador de contexto na chave de cache', () => {
  it('mesmo texto → mesma assinatura (o cache precisa ser reaproveitado)', () => {
    const t = 'Rede municipal com foco em alfabetização na idade certa.';
    expect(assinaturaCurta(t)).toBe(assinaturaCurta(t));
  });

  it('textos diferentes → assinaturas diferentes (é o ponto: não colidir)', () => {
    expect(assinaturaCurta('PPP da escola A')).not.toBe(assinaturaCurta('PPP da escola B'));
  });

  it('diferença pequena ainda separa — PPP editado não reusa o PDF velho', () => {
    expect(assinaturaCurta('foco em leitura')).not.toBe(assinaturaCurta('foco em leituras'));
  });

  it('é seguro como nome de arquivo (só [0-9a-z])', () => {
    const casos = ['acentuação çãõ', 'com / barra e \\ contrabarra', '"aspas" e \'apóstrofo\'', '  espaços  '];
    for (const c of casos) expect(assinaturaCurta(c)).toMatch(/^[0-9a-z]+$/);
  });

  it('tolera vazio/nulo sem quebrar a chave', () => {
    expect(assinaturaCurta('')).toMatch(/^[0-9a-z]+$/);
    expect(assinaturaCurta(null as any)).toMatch(/^[0-9a-z]+$/);
  });

  it('não é determinístico por acidente — texto longo também estabiliza', () => {
    const longo = 'contexto '.repeat(500);
    expect(assinaturaCurta(longo)).toBe(assinaturaCurta(longo));
  });

  it('a chave montada separa contextos diferentes do MESMO conteúdo e arquétipo', () => {
    // O cenário exato do F-E7: mesma pessoa-arquétipo, contexto institucional distinto.
    const chave = (ctx: string) => `final/perso/c1/e1/SC-${assinaturaCurta(ctx)}.pdf`;
    expect(chave('PPP escola A')).not.toBe(chave('PPP escola B'));
    expect(chave('PPP escola A')).toBe(chave('PPP escola A'));
  });
});
