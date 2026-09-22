// Guardas de conduta do Beto no WhatsApp (lib/whatsapp/suporte-conduta.ts).
// Puras: sem banco, sem rede. Os casos negativos importam tanto quanto os
// positivos, porque falso positivo aqui cala o Beto ou manda o CVV para quem
// só reclamou do site.
import { describe, it, expect } from 'vitest';
import {
  ehBloqueioDeSeguranca,
  ehSoConfirmacao,
  linguagemImpropria,
  linkNaoPermitido,
  normalizar,
  passouParaEquipe,
  respostaEscalada,
  sinalDeSofrimento,
  TEXTO_DENUNCIA,
  TEXTO_OFENSA,
  TEXTO_SOFRIMENTO,
  verificarResposta,
} from '@/lib/whatsapp/suporte-conduta';

describe('normalizar', () => {
  it('tira acento, emoji e pontuação antes de qualquer regex', () => {
    expect(normalizar('Você é Ótimo!! 👍🏼')).toBe('voce e otimo');
    expect(normalizar(null)).toBe('');
  });
});

describe('sinal de sofrimento na entrada', () => {
  it.each([
    'quero morrer',
    'Às vezes penso em me matar',
    'estou pensando em suicídio',
    'não quero mais viver',
    'queria acabar com a minha vida',
    'tenho vontade de me machucar',
    'seria melhor se eu morresse',
  ])('dispara: %s', (t) => {
    expect(sinalDeSofrimento(t)).toBe(true);
  });

  it.each([
    'não aguento mais esse site',
    'o botão sumiu da tela',
    'essa plataforma me mata de raiva',
    'estava doente',
    'Tenho muita coisa atrasada?',
  ])('não dispara: %s', (t) => {
    expect(sinalDeSofrimento(t)).toBe(false);
  });
});

describe('confirmação pura (o Beto não precisa responder)', () => {
  // Mensagens reais recebidas entre 24/08 e 22/09/2026.
  it.each([
    'Ok', 'Obrigada', 'Obrigado!', '👍🏼', 'Certo', 'Ok vou fazer', 'Já respondi',
    'Respondido', 'Bom dia. Ok! Obrigada. 🤝🏻', 'Tudo bem, boa tarde', '.', 'Ja fiz',
  ])('confirmação: %s', (t) => {
    expect(ehSoConfirmacao(t)).toBe(true);
  });

  it.each([
    'Bom dia', 'Oi', 'Boa noite', 'Não consigo', 'Estão cobrando o que já fiz.',
    'ok, mas o vídeo não abre', 'avaliação de auto cuidado e bem estar respondido',
    'Obrigada, mas não recebi o link',
  ])('não é confirmação: %s', (t) => {
    expect(ehSoConfirmacao(t)).toBe(false);
  });

  it('texto vazio não é confirmação (o elegível já barra antes)', () => {
    expect(ehSoConfirmacao('')).toBe(false);
    expect(ehSoConfirmacao(null)).toBe(false);
  });
});

describe('linguagem imprópria na saída', () => {
  it.each([
    ['Que porra é essa', 'porra'],
    ['Você é um idiota', 'idiota'],
    ['cala a boca', 'cala a boca'],
    ['Não seja BURRO', 'burro'],
    ['foda-se', 'foda'],
  ])('reprova "%s"', (t, termo) => {
    expect(linguagemImpropria(t)).toBe(termo);
  });

  it.each([
    'Reinicie o computador e tente de novo.',
    'Isso não é disputa, é só um ajuste.',
    'Confira a pasta de lixo eletrônico do seu e-mail.',
    'Entendi o problema. Seu acesso já está liberado.',
    'Se precisar, estou por aqui 😊',
  ])('deixa passar "%s"', (t) => {
    expect(linguagemImpropria(t)).toBeNull();
  });
});

describe('link na saída', () => {
  it('só a porta pública de acesso passa', () => {
    expect(linkNaoPermitido('Gere um novo em https://app.vertho.ai/entrar.')).toBeNull();
    expect(linkNaoPermitido('Entre em app.vertho.ai e clique em Entrar')).toBeNull();
    expect(linkNaoPermitido('Sou o Beto, assistente virtual da Vertho')).toBeNull();
  });

  it.each([
    'Clique aqui: https://bit.ly/abc',
    'Veja www.google.com',
    'acesse empresa-x.vertho.ai/auth/callback?token_hash=abc',
    'mande para rodrigo@gmail.com',
  ])('reprova "%s"', (t) => {
    expect(linkNaoPermitido(t)).not.toBeNull();
  });
});

describe('verificarResposta', () => {
  it('diz o motivo e o trecho, para o registro', () => {
    expect(verificarResposta('Deixa de ser idiota')).toEqual({ motivo: 'linguagem-impropria', trecho: 'idiota' });
    expect(verificarResposta('Veja https://golpe.com/x')).toEqual({ motivo: 'link-nao-permitido', trecho: 'https://golpe.com/x' });
    expect(verificarResposta('Tente gerar um novo link em https://app.vertho.ai/entrar')).toBeNull();
  });
});

describe('textos fixos', () => {
  it('passam pela própria verificação de palavrão e não têm travessão', () => {
    for (const t of [TEXTO_SOFRIMENTO, TEXTO_DENUNCIA, TEXTO_OFENSA, respostaEscalada(false), respostaEscalada(true)]) {
      expect(linguagemImpropria(t)).toBeNull();
      expect(t).not.toMatch(/[—–]/);
    }
  });

  it('sofrimento leva o CVV e o SAMU; denúncia leva o 190', () => {
    expect(TEXTO_SOFRIMENTO).toContain('188');
    expect(TEXTO_SOFRIMENTO).toContain('192');
    expect(TEXTO_DENUNCIA).toContain('190');
  });

  it('a escalada só se apresenta no primeiro turno', () => {
    expect(respostaEscalada(false)).toContain('Sou o Beto');
    expect(respostaEscalada(true)).not.toContain('Sou o Beto');
  });

  it('escalada e aviso de ofensa passam a conversa para a equipe; CVV e denúncia não', () => {
    expect(passouParaEquipe(respostaEscalada(false))).toBe(true);
    expect(passouParaEquipe(` ${respostaEscalada(true)} `)).toBe(true);
    expect(passouParaEquipe(TEXTO_OFENSA)).toBe(true);
    expect(passouParaEquipe(TEXTO_SOFRIMENTO)).toBe(false);
    expect(passouParaEquipe(TEXTO_DENUNCIA)).toBe(false);
    expect(passouParaEquipe('Oi! Tente em https://app.vertho.ai/entrar')).toBe(false);
  });
});

describe('bloqueio do filtro do Google', () => {
  it('reconhece o erro de conteúdo vazio por segurança, e não o de truncamento', () => {
    expect(ehBloqueioDeSeguranca('Gemini gemini-3.7-flash devolveu conteúdo VAZIO (finishReason=SAFETY, output=0, thinking=0).')).toBe(true);
    expect(ehBloqueioDeSeguranca('Gemini x devolveu conteúdo VAZIO (finishReason=ausente, blockReason=SAFETY, output=0, thinking=0).')).toBe(true);
    expect(ehBloqueioDeSeguranca('Gemini x devolveu conteúdo VAZIO (finishReason=MAX_TOKENS, output=700, thinking=0).')).toBe(false);
    expect(ehBloqueioDeSeguranca('The operation was aborted due to timeout')).toBe(false);
  });
});
