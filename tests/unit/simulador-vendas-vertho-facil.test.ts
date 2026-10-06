import { describe, expect, it } from 'vitest';
import { cenario, estado } from '../fixtures/simulador-vendas';
import { validarCenario } from '@/lib/simulador-vendas/core';
import { PROMPT_VERSION } from '@/lib/simulador-vendas/prompts';
import { criarContextoCompetitivoVertho } from '@/lib/simulador-vendas/vertho';
import { TRACOS_DIVERSIDADE } from '@/lib/simulador-vendas/diversidade';
import {
  DIFICULDADE_VERTHO_VERSION,
  TRACOS_VERTHO_FACIL,
  tracosParaVertho,
} from '@/lib/simulador-vendas/dificuldade-vertho';

function casoFacil() {
  const s = estado();
  s.vertho = criarContextoCompetitivoVertho({ segmento: 'empresa' }, 0);
  s.prompts.criador.versao = `${PROMPT_VERSION}-${DIFICULDADE_VERTHO_VERSION}`;
  const c = structuredClone(cenario);
  c.personagem.personalidade_pace = 'Estável';
  c.personagem.negociacao.objecoes_profundas = [];
  c.personagem.personalidade_nivel.cenarios_validos = [];
  return { s, c };
}

describe('calibração fácil do treinamento comercial Vertho', () => {
  it('aceita um perfil receptivo com uma objeção e até dois benefícios', () => {
    const { s, c } = casoFacil();
    expect(() => validarCenario(c, s)).not.toThrow();
    c.personagem.personalidade_pace = 'Influente';
    expect(() => validarCenario(c, s)).not.toThrow();
  });
  it.each(['Dominante', 'Conforme'] as const)(
    'recusa o perfil %s no novo fácil',
    (disc) => {
      const { s, c } = casoFacil();
      c.personagem.personalidade_pace = disc;
      expect(() => validarCenario(c, s)).toThrow('perfil receptivo');
    },
  );
  it('recusa uma objeção profunda, mesmo com uma só objeção principal', () => {
    const { s, c } = casoFacil();
    c.personagem.negociacao.objecoes_profundas = [
      {
        descricao: 'Barreira escondida',
        gatilho_revelacao: 'Duas perguntas',
        ideal: 'Resolução',
        minimo_aceitavel: 'Resolução',
      },
    ];
    expect(() => validarCenario(c, s)).toThrow('objeções profundas');
  });
  it('recusa sobrecarga de benefícios e desfechos condicionais no fácil', () => {
    const { s, c } = casoFacil();
    const beneficio = c.personagem.negociacao.beneficios_ocultos[0];
    c.personagem.negociacao.beneficios_ocultos = Array.from(
      { length: 3 },
      (_, i) => ({ ...beneficio, nome: `Necessidade ${i}` }),
    );
    expect(() => validarCenario(c, s)).toThrow('dois benefícios');
    c.personagem.negociacao.beneficios_ocultos = [beneficio];
    c.personagem.personalidade_nivel.cenarios_validos = [
      {
        nome: 'Dependente de comitê',
        nota_corte_objecao: 2.5,
        nota_corte_preco: 1.5,
      },
    ];
    expect(() => validarCenario(c, s)).toThrow('cenários condicionais');
  });
  it.each(['comercial-1', 'comercial-2'])(
    'não revalida históricos %s com as novas regras',
    (versao) => {
      const { s } = casoFacil();
      s.prompts.criador.versao = `${PROMPT_VERSION}-${versao}`;
      expect(() => validarCenario(structuredClone(cenario), s)).not.toThrow();
    },
  );
  it('preserva o cenário do simulador genérico', () => {
    const { s } = casoFacil();
    delete s.vertho;
    expect(() => validarCenario(structuredClone(cenario), s)).not.toThrow();
  });
  it('preserva a diversidade dos níveis médio e alto e impede seeds hostis no fácil', () => {
    expect(tracosParaVertho(1)).toEqual(TRACOS_VERTHO_FACIL);
    expect(
      tracosParaVertho(1).some((t) =>
        /agressivo|cético|pressão|resistente|burocrático/i.test(t),
      ),
    ).toBe(false);
    expect(tracosParaVertho(2)).toBe(TRACOS_DIVERSIDADE);
    expect(tracosParaVertho(3)).toBe(TRACOS_DIVERSIDADE);
  });
});
