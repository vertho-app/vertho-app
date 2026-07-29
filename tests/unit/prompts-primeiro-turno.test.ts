import { describe, it, expect } from 'vitest';
import { promptSocratic } from '@/lib/season-engine/prompts/socratic';
import { promptAnalytic } from '@/lib/season-engine/prompts/analytic';
import { promptMissaoFeedback } from '@/lib/season-engine/prompts/missao-feedback';

/**
 * INVARIANTE: todo prompt de conversa produz ao menos UMA mensagem no turn 1.
 *
 * A API da Anthropic recusa `messages: []` com 400 ("at least one message is
 * required"), e `/api/temporada/reflection` converte isso em 500 "Erro na IA". No
 * turn 1 o histórico é vazio POR DEFINIÇÃO — a pessoa acabou de clicar o botão que
 * inicia a conversa e ainda não escreveu nada. Sem injetar a mensagem de abertura,
 * a conversa simplesmente nunca começa.
 *
 * Estado em 29/07: só o `socratic` injetava. `missao_feedback` (semana de missão,
 * caminho "Sim, consegui") e `analytic` (caminho "Não" → cenário escrito; avaliação)
 * não injetavam — e o número bate: 0 de 144 semanas de aplicação tinham qualquer
 * transcript, contra 37 nas semanas de conteúdo.
 *
 * O teste roda sobre OS TRÊS de propósito: a falha original foi um prompt novo
 * nascer sem copiar o detalhe do irmão. Um prompt de conversa novo entra aqui.
 */

const base = {
  nomeColab: 'Paulo', cargo: 'Representante Comercial', competencia: 'Negociação e Fechamento',
  descritoresCobertos: ['Criação de senso de urgência', 'Tratamento de objeções'],
  historico: [], turnIA: 1,
};

const PROMPTS: [string, () => { messages: { role: string; content: string }[] }][] = [
  ['socratic', () => promptSocratic({ ...base, descritor: 'Criação de senso de urgência', desafio: 'faça X', desafios: [] } as any)],
  ['analytic', () => promptAnalytic({ ...base, cenario: 'Um cliente sumiu após a proposta.' } as any)],
  ['missao_feedback', () => promptMissaoFeedback({ ...base, missao: 'Reative uma negociação parada.', compromisso: 'Na reunião de quarta.' } as any)],
];

describe('primeiro turno de conversa nunca vai com messages vazio', () => {
  for (const [nome, montar] of PROMPTS) {
    it(`${nome}: turn 1 com histórico vazio produz ao menos 1 mensagem`, () => {
      const { messages } = montar();
      expect(messages.length).toBeGreaterThan(0);
      expect(messages[0].content.trim()).not.toBe('');
    });
  }

  it('a injeção vale só para o turn 1 — turnos seguintes carregam o histórico real', () => {
    const historico = [
      { role: 'user', content: 'Consegui executar na reunião de quarta.' },
      { role: 'assistant', content: 'Me conta o que aconteceu.' },
    ];
    const { messages } = promptMissaoFeedback({ ...base, historico, turnIA: 2, missao: 'Reative.', compromisso: 'quarta' } as any);
    expect(messages).toHaveLength(2);
    expect(messages[0].content).toBe('Consegui executar na reunião de quarta.');
  });
});
