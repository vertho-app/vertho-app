import { describe, it, expect } from 'vitest';
import { mensagemT0, mensagemT1, type LeadConarhMsg } from '@/lib/conarh/mensagens';

/**
 * CONARH 52 — tom e vocabulário do follow-up.
 *
 * Estes dois textos saem no WhatsApp de quem visitou o estande, sem revisão
 * humana no caminho. Os dois erros que motivaram o teste estavam no T+0 já
 * enviado (04/08/2026):
 *
 * 1. "porta 1" — vocabulário do CÓDIGO. A tela que ele tocou diz "etapa" em
 *    todo lugar ("As 5 etapas", "Etapa 1 de 5", "Próxima etapa").
 * 2. "Dá para encaminhar direto para quem decide" — trata quem recebe como
 *    quem NÃO decide. O convite a compartilhar se faz pelo formato.
 */

const lead: LeadConarhMsg = {
  id: '96b018ee-e485-4391-8f78-2e7b1fca9d72',
  nome: 'Rodrigo Naves',
  organizacao: 'teste',
  porta_escolhida: 1,
  competencia_critica: 'Feedback e Desenvolvimento de Pessoas',
};

const textos = () => [
  ['T+0', mensagemT0(lead)],
  ['T+0 sem qualificação', mensagemT0({ ...lead, porta_escolhida: null, competencia_critica: null })],
  ['T+0 com reunião', mensagemT0({ ...lead, reuniao_em: '2026-08-19T17:00:00.000Z' })],
  ['T+1', mensagemT1(lead)],
] as const;

describe('mensagens do CONARH', () => {
  it('fala "etapa", nunca "porta" — o visitante não conhece o nome do componente', () => {
    for (const [rotulo, texto] of textos()) {
      expect(texto, rotulo).not.toMatch(/\bportas?\b/i);
    }
    expect(mensagemT0(lead)).toContain('etapa 1 (Definir o que desenvolver)');
  });

  it('não presume que quem recebe não decide', () => {
    for (const [rotulo, texto] of textos()) {
      expect(texto.toLowerCase(), rotulo).not.toContain('quem decide');
    }
  });

  it('não encaixa o nome da empresa depois de um artigo fixo', () => {
    // Regressão: `aí na ${organizacao}` produzia "aí na Grupo Marista" — e,
    // com um lead de teste, o memorável "aí na teste". Nome de empresa não
    // tem gênero previsível; a saída não deve depender disso.
    for (const org of ['Grupo Marista', 'Sesc', 'teste', 'Instituto Ayrton Senna']) {
      const t0 = mensagemT0({ ...lead, organizacao: org });
      expect(t0, org).not.toContain(`na ${org}`);
      expect(t0, org).not.toContain(`no ${org}`);
    }
  });

  it('entrega o link do mapa e cita a competência com as palavras dele', () => {
    const t0 = mensagemT0(lead);
    expect(t0).toContain(`/conarh/mapa/${lead.id}`);
    expect(t0).toContain('"Feedback e Desenvolvimento de Pessoas"');
    expect(mensagemT1(lead)).toContain('"Feedback e Desenvolvimento de Pessoas"');
  });
});
