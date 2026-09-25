import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  chaveGrupoAvatar, problemasDosTextosAvatar, aplicarAvatarFixo, avatarDoGrupoParaCenas, recusaDoPortao,
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
