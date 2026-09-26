import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  chaveGrupoAvatar, problemasDosTextosAvatar, aplicarAvatarFixo, avatarDoGrupoParaCenas, recusaDoPortao,
  nivelDeFalaDb, ritmoPalavrasPorSeg, avaliarEmenda, aplicarGanhoPcm16, nivelarMiolo, FAIXA_RITMO, GANHO_MAX_DB,
  type AvatarGrupoPayload,
} from '@/lib/video/avatar-grupo';
import { normalizarRoteiro } from '@/lib/video/roteiro-prompt';

/**
 * Avatar compartilhado por grupo: as peças PURAS (25/09/2026).
 *
 * O clipe da HeyGen é lip-sync de UM áudio. Reaproveitá-lo numa célula cujo texto de
 * abertura difere por uma vírgula é boca de uma frase com som de outra, sem erro
 * nenhum no pipeline. Por isso a irmã só aceita o avatar da mãe com texto IGUAL e
 * assinatura (voz, modelo, foto, motor, fps) igual, e este arquivo prova as duas travas.
 */

const FIXO = {
  intro: { title: 'O que decide o seu dia', subtitle: 'Critério antes da urgência', narration: 'Quando tudo chega ao mesmo tempo, quem decide o seu dia é a urgência de outra pessoa. Hoje você vai ver como trocar essa lógica por um critério que é seu, claro e defensável.' },
  outro: { title: 'Sua próxima escolha', subtitle: 'O que sai da lista primeiro?', narration: 'Você já sabe o que protege o seu planejamento. Olhe para a sua semana com calma. Qual demanda vai sair da lista primeiro, e com que critério?' },
};

const roteiroDoModelo = () => ({
  title: 'Organização',
  scenes: [
    { id: 'a', type: 'avatar_intro', title: 'Outro título', subtitle: 'x', narration: 'Olá! Um texto que o modelo reescreveu por conta própria.', key_idea: 'ideia do modelo', source_anchor: 'IDEIA_PRINCIPAL' },
    { id: 'b', type: 'concept_reveal', title: 'Conceito', narration: 'O miolo no tom do perfil.', key_idea: 'k', source_anchor: 'PRINCIPIOS', bullets: ['a', 'b', 'c'] },
    { id: 'c', type: 'steps_flow', title: 'Passos', narration: 'Mais miolo.', key_idea: 'k2', source_anchor: 'BOAS_PRATICAS', items: ['a', 'b', 'c'] },
    { id: 'd', type: 'avatar_outro', title: 'Fecho do modelo', subtitle: 'y', narration: 'Um fecho diferente, sem pergunta.', key_idea: 'fecho', source_anchor: 'IDEIA_PRINCIPAL' },
  ],
});

const CHAVE = { empresaId: 'emp-1', moduloBaseId: 'mod-1', cargo: 'Professor(a)', pppBrief: 'Escola integral.', cargoBloco: 'CARGO: Professor(a).' };

describe('chaveGrupoAvatar', () => {
  it('é estável para a mesma entrada', () => {
    expect(chaveGrupoAvatar(CHAVE)).toBe(chaveGrupoAvatar({ ...CHAVE }));
  });

  it('muda com cada coisa que muda o TEXTO do avatar', () => {
    const base = chaveGrupoAvatar(CHAVE);
    for (const [campo, valor] of [
      ['empresaId', 'emp-2'], ['moduloBaseId', 'mod-2'], ['cargo', 'Diretor(a)'],
      ['pppBrief', 'Outra escola.'], ['cargoBloco', 'CARGO: Diretor(a).'],
    ] as const) {
      expect(chaveGrupoAvatar({ ...CHAVE, [campo]: valor }), campo).not.toBe(base);
    }
  });

  it('PPP ausente e PPP vazio são o mesmo grupo (nenhum dos dois entra no texto)', () => {
    expect(chaveGrupoAvatar({ ...CHAVE, pppBrief: null })).toBe(chaveGrupoAvatar({ ...CHAVE, pppBrief: '' }));
  });
});

describe('problemasDosTextosAvatar', () => {
  it('textos dentro da régua passam', () => {
    expect(problemasDosTextosAvatar(FIXO)).toEqual([]);
  });

  it('abertura com cumprimento é recusada (a saudação com o nome entra antes dela)', () => {
    const t = { ...FIXO, intro: { ...FIXO.intro, narration: `Olá! ${FIXO.intro.narration}` } };
    expect(problemasDosTextosAvatar(t).join()).toMatch(/cumprimento/);
    const t2 = { ...FIXO, intro: { ...FIXO.intro, narration: `Bem-vinda a mais um passo. ${FIXO.intro.narration.split(' ').slice(5).join(' ')}` } };
    expect(problemasDosTextosAvatar(t2).join()).toMatch(/cumprimento/);
  });

  it('fecho sem pergunta é recusado', () => {
    const t = { ...FIXO, outro: { ...FIXO.outro, narration: FIXO.outro.narration.replace(/\?$/, '.') } };
    expect(problemasDosTextosAvatar(t).join()).toMatch(/pergunta/);
  });

  it('tamanho fora da folga é recusado, nas duas pontas', () => {
    const curto = { ...FIXO, intro: { ...FIXO.intro, narration: 'Quando tudo chega junto, quem decide?' } };
    expect(problemasDosTextosAvatar(curto).join()).toMatch(/intro com \d+ palavras/);
    const longo = { ...FIXO, outro: { ...FIXO.outro, narration: `${FIXO.outro.narration.replace(/\?$/, ',')} ${'e mais uma coisa'.repeat(3)}?` } };
    expect(problemasDosTextosAvatar(longo).join()).toMatch(/outro com \d+ palavras/);
  });

  it('tela: título longo ou subtítulo vazio são recusados', () => {
    const t = { ...FIXO, intro: { ...FIXO.intro, title: 'um dois três quatro cinco seis sete oito nove' }, outro: { ...FIXO.outro, subtitle: ' ' } };
    const p = problemasDosTextosAvatar(t).join(' | ');
    expect(p).toMatch(/intro: title/);
    expect(p).toMatch(/outro: subtitle/);
  });
});

describe('aplicarAvatarFixo', () => {
  it('sobrescreve o que o modelo escreveu nas cenas de avatar e preserva o resto', () => {
    const r = aplicarAvatarFixo(roteiroDoModelo(), FIXO);
    const intro = r.scenes[0], outro = r.scenes[3];
    expect([intro.narration, intro.title, intro.subtitle]).toEqual([FIXO.intro.narration, FIXO.intro.title, FIXO.intro.subtitle]);
    expect([outro.narration, outro.title, outro.subtitle]).toEqual([FIXO.outro.narration, FIXO.outro.title, FIXO.outro.subtitle]);
    expect(intro.key_idea).toBe('ideia do modelo');
    expect(r.scenes[1].narration).toBe('O miolo no tom do perfil.');
  });

  it('cena de avatar esquecida pelo modelo é criada, e o normalizar põe cada uma no seu lugar', () => {
    const semOutro = roteiroDoModelo();
    semOutro.scenes = semOutro.scenes.filter((s) => s.type !== 'avatar_outro');
    const r = normalizarRoteiro(aplicarAvatarFixo(semOutro, FIXO) as any);
    expect(r.scenes.map((s) => s.type)).toEqual(['avatar_intro', 'concept_reveal', 'steps_flow', 'avatar_outro']);
    expect(r.scenes.map((s) => s.id)).toEqual(['scene-1', 'scene-2', 'scene-3', 'scene-4']);
    // O normalizar colapsa espaço e trunca título: o texto fixo tem que sair INTACTO.
    expect(r.scenes[3].narration).toBe(FIXO.outro.narration);
    expect(r.scenes[0].narration).toBe(FIXO.intro.narration);
  });
});

const ASSINATURA = 'Aoede|gemini-2.5-flash-tts|2026-09-05|abcd1234|foto|avatar_iii|30';
const payload = (extra: Partial<AvatarGrupoPayload> = {}): AvatarGrupoPayload => ({
  grupoId: 'g-1', assinatura: ASSINATURA, f0Hz: 205, textos: FIXO,
  referencia: { takeUnico: false, nivelDb: -22, pps: 2.01 },
  avatar: {
    intro: { src: 'https://x/mae/scene-1.mp4', audioSrc: 'https://x/mae/scene-1.mp3', durationSec: 15.2, heygenVideoId: 'h1' },
    outro: { src: 'https://x/mae/scene-9.mp4', audioSrc: 'https://x/mae/scene-9.mp3', durationSec: 13.1, heygenVideoId: 'h2' },
  },
  ...extra,
});
const roteiroDaIrma = () => normalizarRoteiro(aplicarAvatarFixo(roteiroDoModelo(), FIXO) as any);

describe('avatarDoGrupoParaCenas', () => {
  it('mesmo texto e mesma assinatura: as duas cenas de avatar chegam prontas da mãe', () => {
    const r = avatarDoGrupoParaCenas(roteiroDaIrma(), payload(), { assinaturaAtual: ASSINATURA });
    expect(r.recusa).toBeUndefined();
    expect([...r.fixas]).toEqual(['scene-1', 'scene-4']);
    expect(r.assets['scene-1'].src).toBe('https://x/mae/scene-1.mp4');
    expect(r.assets['scene-4'].audioSrc).toBe('https://x/mae/scene-9.mp3');
  });

  it('assinatura diferente (outra voz, foto, motor ou fps): recusa, nada é reaproveitado', () => {
    const r = avatarDoGrupoParaCenas(roteiroDaIrma(), payload(), { assinaturaAtual: ASSINATURA.replace('avatar_iii', 'avatar_iv') });
    expect(r.recusa).toMatch(/assinatura/);
    expect(r.fixas.size).toBe(0);
    expect(r.assets).toEqual({});
  });

  it('texto de avatar diferente do grupo: recusa (a boca não casaria com o som)', () => {
    const rot = roteiroDaIrma();
    rot.scenes[3].narration = FIXO.outro.narration.replace('com calma', 'com cuidado');
    const r = avatarDoGrupoParaCenas(rot, payload(), { assinaturaAtual: ASSINATURA });
    expect(r.recusa).toMatch(/avatar_outro com texto diferente/);
    expect(r.assets).toEqual({});
  });

  it('diferença só de espaçamento não é texto diferente', () => {
    const rot = roteiroDaIrma();
    rot.scenes[0].narration = `  ${FIXO.intro.narration.replace(/ /g, '  ')} `;
    expect(avatarDoGrupoParaCenas(rot, payload(), { assinaturaAtual: ASSINATURA }).recusa).toBeUndefined();
  });

  it('cena pedida em `regerarCenas` não é preenchida pelo grupo', () => {
    const r = avatarDoGrupoParaCenas(roteiroDaIrma(), payload(), { assinaturaAtual: ASSINATURA, regerarCenas: ['scene-1'] });
    expect([...r.fixas]).toEqual(['scene-4']);
    expect(r.assets['scene-1']).toBeUndefined();
  });
});

describe('recusaDoPortao', () => {
  it('casa a mensagem que o portão do TTS lança quando nenhuma tentativa passa', () => {
    // A frase vem de lib/gemini-tts.ts. Se ela mudar lá, a irmã deixaria de sair do
    // grupo quando o portão a recusa, e ninguém veria.
    const fonte = readFileSync('lib/gemini-tts.ts', 'utf-8');
    expect(fonte).toContain('tentativa(s) passou no controle de qualidade; áudio não publicado');
    expect(recusaDoPortao('TTS: nenhuma das 3 tentativa(s) passou no controle de qualidade; áudio não publicado (registro 2,1 st acima do alvo)')).toBe(true);
  });

  it('falhas que aconteceriam sem o grupo NÃO contam como recusa', () => {
    for (const m of [
      'Whisper indisponível (sem timing por palavra, não há como cortar)',
      'upload de fatia falhou (1/6): scene-3: 503',
      'TTS: nenhuma das 3 tentativa(s) tem fala (sem fala)',
      'corte sem pausa entre scene-2 e scene-3',
    ]) expect(recusaDoPortao(m), m).toBe(false);
  });
});

/** PCM 16-bit mono: seno de 220 Hz com amplitude de pico `amp` (0..1), `segundos` de duração. */
function tom(amp: number, segundos: number, sr = 24000): Buffer {
  const n = Math.round(segundos * sr), b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * 32767 * Math.sin((2 * Math.PI * 220 * i) / sr)), i * 2);
  return b;
}
/** `n` palavras a EXATAMENTE `pps` palavras por segundo (a última termina em n/pps). */
const falaA = (pps: number, n = 20, t0 = 0) => Array.from({ length: n }, (_, i) => ({ word: `p${i}`, start: t0 + i / pps, end: t0 + (i + 1) / pps }));

describe('nivelDeFalaDb e ritmoPalavrasPorSeg', () => {
  it('nível = RMS da fala em dBFS; o silêncio entre as falas não puxa para baixo', () => {
    // Seno de pico 0,1 → RMS 0,0707 → −23,0 dBFS.
    expect(nivelDeFalaDb(tom(0.1, 3), 24000)).toBeCloseTo(-23, 0);
    const comPausa = Buffer.concat([tom(0.1, 2), Buffer.alloc(24000 * 2 * 3), tom(0.1, 2)]);
    expect(nivelDeFalaDb(comPausa, 24000)).toBeCloseTo(-23, 0);
    expect(nivelDeFalaDb(Buffer.alloc(24000 * 2 * 3), 24000)).toBeNull();
  });

  it('ritmo soma os trechos (cada um da 1ª à última palavra) e exige 10 palavras', () => {
    expect(ritmoPalavrasPorSeg([falaA(2, 10), falaA(2, 10, 50)])).toBeCloseTo(2, 5);
    expect(ritmoPalavrasPorSeg([falaA(2, 5)])).toBeNull();
    expect(ritmoPalavrasPorSeg([undefined, null, []])).toBeNull();
  });
});

describe('avaliarEmenda · os números da escuta cega de 26/09/2026', () => {
  const REF = { takeUnico: false, nivelDb: -20, pps: 2.01 };

  it('miolo 1,23× mais rápido que o avatar (o A, que o dono reprovou): recusa', () => {
    const r = avaliarEmenda(REF, [{ id: 'scene-2', nivelDb: -25, words: falaA(2.47) }]);
    expect(r.ok).toBe(false);
    expect(r.motivo).toMatch(/ritmo do miolo 1\.23× o do avatar/);
  });

  it('miolo 1,04× (o B, o melhor): aceita e calcula o ganho para o nível do avatar', () => {
    const r = avaliarEmenda(REF, [
      { id: 'scene-2', nivelDb: -25, words: falaA(2.10) },
      { id: 'scene-3', nivelDb: -20.3, words: falaA(2.10) },
    ]);
    expect(r.ok).toBe(true);
    expect(r.razaoRitmo).toBeGreaterThan(1 - FAIXA_RITMO);
    expect(r.razaoRitmo).toBeLessThan(1 + FAIXA_RITMO);
    // −25 → −20: +5 dB. A −20,3 a diferença não se ouve: fica como está.
    expect(r.ganhos).toEqual({ 'scene-2': 5 });
  });

  it(`ganho limitado a ±${GANHO_MAX_DB} dB; sem nível de referência, nenhum ganho (mas a emenda vale)`, () => {
    const r = avaliarEmenda(REF, [{ id: 'scene-2', nivelDb: -40, words: falaA(2.01) }]);
    expect(r.ganhos['scene-2']).toBe(GANHO_MAX_DB);
    const s = avaliarEmenda({ ...REF, nivelDb: null }, [{ id: 'scene-2', nivelDb: -40, words: falaA(2.01) }]);
    expect(s.ok).toBe(true);
    expect(s.ganhos).toEqual({});
  });

  it('sem ritmo medido (ASR sem timing) RECUSA: sem medida não há como afirmar a costura', () => {
    expect(avaliarEmenda(REF, [{ id: 'scene-2', nivelDb: -20, words: undefined }]).ok).toBe(false);
    expect(avaliarEmenda({ ...REF, pps: null }, [{ id: 'scene-2', nivelDb: -20, words: falaA(2) }]).ok).toBe(false);
  });
});

describe('aplicarGanhoPcm16 e nivelarMiolo', () => {
  it('+6 dB dobra a amplitude', () => {
    const r = aplicarGanhoPcm16(tom(0.1, 1), 6.0206);
    expect(nivelDeFalaDb(r.pcm, 24000)).toBeCloseTo(-17, 0);
    expect(r.ganhoDb).toBeCloseTo(6.02, 1);
  });

  it('nunca clipa: se o pico passaria do teto, o ganho encolhe e o valor aplicado volta', () => {
    const r = aplicarGanhoPcm16(tom(0.5, 1), 9);
    let pico = 0;
    for (let i = 0; i < r.pcm.length / 2; i++) pico = Math.max(pico, Math.abs(r.pcm.readInt16LE(i * 2)));
    expect(pico).toBeLessThanOrEqual(Math.ceil(0.977 * 32767));
    expect(r.ganhoDb).toBeLessThan(9);
    expect(r.ganhoDb).toBeCloseTo(20 * Math.log10(0.977 / 0.5), 1);
  });

  it('só reescreve as cenas com ganho, e sobe o PCM já com o ganho', async () => {
    const baixadas: string[] = [];
    const subidas: Record<string, number | null> = {};
    const r = await nivelarMiolo({ 'scene-2': 5 }, {
      baixarPcm: async (id) => { baixadas.push(id); return tom(0.1, 2); },
      subir: async (id, pcm) => { subidas[id] = nivelDeFalaDb(pcm, 24000); return `https://x/${id}-nivel.mp3`; },
    });
    expect(baixadas).toEqual(['scene-2']);
    expect(subidas['scene-2']).toBeCloseTo(-18, 0);
    expect(r).toEqual({ 'scene-2': { src: 'https://x/scene-2-nivel.mp3', ganhoDb: 5 } });
  });
});

