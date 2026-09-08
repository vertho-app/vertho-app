import { describe, expect, it } from 'vitest';
import { ELENCO, personagemDaVoz } from '@/lib/tts/elenco';
import { DIRECAO_POR_PERSONAGEM, direcaoDaVoz } from '@/lib/tts/canario';
import { ALVO_F0_POR_VOZ } from '@/lib/tts/deriva';

/**
 * O canário só prova alguma coisa se medir a voz que está NO AR, com a direção
 * daquele personagem.
 *
 * `Medido: 07/09/2026` — o Beto foi recastado de `Iapetus` para `Algieba`, e a
 * direção do canário era um mapa por NOME DE VOZ. A entrada antiga virou órfã e
 * a voz nova caía num `?? DIRECAO_CANARIO.Aoede`: o canário mediria a voz do
 * Beto com a direção da mentora e compararia contra a assinatura de referência
 * dele. O veredito sairia — sobre outra coisa. Portão que erra o motivo é pior
 * que portão desligado, porque ninguém desconfia de um número que existe.
 */

describe('canário segue o elenco', () => {
  it('🔴 toda voz do elenco tem direção — nenhuma cai num default', () => {
    for (const perfil of Object.values(ELENCO)) {
      expect(() => direcaoDaVoz(perfil.voz), `voz ${perfil.voz}`).not.toThrow();
      expect(direcaoDaVoz(perfil.voz).length).toBeGreaterThan(40);
    }
  });

  it('🔴 a direção segue o PERSONAGEM, não o nome da voz', () => {
    // é isto que sobrevive ao recast: trocar a voz do beto mantém a direção dele
    expect(direcaoDaVoz(ELENCO.beto.voz)).toBe(DIRECAO_POR_PERSONAGEM.beto);
    expect(direcaoDaVoz(ELENCO.mentora.voz)).toBe(DIRECAO_POR_PERSONAGEM.mentora);
    // `not.toBe` sozinho é fraco: a direção da mentora colada no beto com um
    // sufixo qualquer passaria, e é assim que um copy-paste sobrevive à revisão.
    expect(DIRECAO_POR_PERSONAGEM.beto).not.toContain(DIRECAO_POR_PERSONAGEM.mentora.slice(0, 60));
    expect(DIRECAO_POR_PERSONAGEM.mentora).not.toContain(DIRECAO_POR_PERSONAGEM.beto.slice(0, 60));
  });

  it('🔴 voz fora do elenco LANÇA, em vez de ser medida com a direção errada', () => {
    // 'Iapetus' era a voz do Beto até 07/09: o caso exato que ficava órfão
    expect(() => direcaoDaVoz('Iapetus')).toThrow(/fora do elenco/);
    expect(() => direcaoDaVoz('Kore')).toThrow(/fora do elenco/);
  });

  it('a voz volta ao personagem certo', () => {
    expect(personagemDaVoz(ELENCO.mentora.voz)).toBe('mentora');
    expect(personagemDaVoz(ELENCO.beto.voz)).toBe('beto');
    expect(personagemDaVoz('Iapetus')).toBeNull();
  });

  it('quem o canário roda é exatamente quem o portão julga', () => {
    // `rodarCanarioTts` usa as chaves de ALVO_F0_POR_VOZ como lista default, e a
    // regra R19 do health cobra as mesmas: se as duas listas divergirem, o health
    // cobra canário de voz que ninguém roda (ou deixa de cobrar quem está no ar).
    const doElenco = Object.values(ELENCO).map((p) => p.voz).sort();
    expect(Object.keys(ALVO_F0_POR_VOZ).sort()).toEqual(doElenco);
  });
});
