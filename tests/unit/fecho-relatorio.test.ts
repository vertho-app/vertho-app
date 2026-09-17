/**
 * COMO O RELATÓRIO DA TEMPORADA FECHA (17/09/2026).
 *
 * 🔴 POR QUE. A "Mensagem final" era o `insight_geral` do EXTRATOR da conversa,
 * cujo trabalho é auditar base de evidência — e ele escrevia como auditor.
 * `Medido:` nos 10 relatórios de Ibipeba, 7 abriam em terceira pessoa ("A
 * colaboradora demonstra…") e 9 comentavam o próprio instrumento ("a dimensão
 * não foi acessada na conversa", "não trouxe evidência concreta mesmo após duas
 * tentativas da IA"). O documento abria falando COM a pessoa ("Aurelinia, você
 * avançou em intencionalidade…") e fechava falando DELA para um terceiro.
 *
 * E "Próximos passos" era uma seção que só a DEMONSTRAÇÃO tinha: `proximo_passo`
 * vinha de `reflexao.proximo_passo`, campo que o prompt da semana 13 nunca pediu.
 * `Medido:` 37 de 37 relatórios dos tenants de demo com o campo preenchido pelo
 * fixture, 0 de 10 em Ibipeba.
 *
 * Agora os dois nascem no prompt do FECHAMENTO, ao lado da devolutiva de
 * abertura, que já fala com a pessoa. Os relatórios já entregues NÃO foram
 * regerados (decisão do dono), então o fallback aqui não é transição: é o que
 * aqueles documentos têm para sempre.
 */
import { describe, it, expect } from 'vitest';
import { promptEvolutionScenarioScore, validateEvolutionScenarioScore, normalizarPassos } from '@/lib/season-engine/prompts/evolution-scenario';
import { normalizarResumoAvaliacao, fechoDoRelatorio } from '@/lib/season-engine/resumo-avaliacao';
import { resumoSemTratamentoDeGenero } from '@/lib/redacao-sem-genero';
import { sanitizarNarrativaPiloto } from '@/lib/season-engine/piloto-trava';

const PARAMS = {
  competencia: 'Colaboração docente',
  descritores: [{ descritor: 'Rituais formativos', nota_atual: 1.5, n1_gap: 'a', n3_meta: 'b' }],
  cenario: 'CENÁRIO',
  resposta: 'RESPOSTA',
  nomeColab: 'Aurelinia',
  perfilDominante: 'S',
  evidenciasAcumuladas: 'EVIDÊNCIAS',
  acumuladoPrimaria: null,
  semanaFinal: 7,
  semanasEvidencia: 6,
};

describe('prompt do fechamento: o fecho e os passos', () => {
  it('pede o fecho em segunda pessoa, pelo nome, e proíbe falar sobre a pessoa a um terceiro', () => {
    const { system } = promptEvolutionScenarioScore(PARAMS as any);
    expect(system).toContain('FECHO (mensagem_final)');
    expect(system).toContain('Escreva PARA Aurelinia, em segunda pessoa');
    expect(system).toContain('a pessoa demonstrou');
    expect(system).toContain('a colaboradora apresenta');
  });

  /**
   * A regra que motivou tudo: o fecho não fala do INSTRUMENTO. Cada palavra
   * aqui apareceu num relatório real de Ibipeba, dentro do texto que a pessoa
   * leu por último.
   */
  it('nomeia o padrão proibido palavra por palavra, em vez de pedir "seja motivador"', () => {
    const { system } = promptEvolutionScenarioScore(PARAMS as any);
    const bloco = system.slice(system.indexOf('FECHO (mensagem_final)'), system.indexOf('PRÓXIMOS PASSOS'));
    for (const palavra of ['conversa', 'microcaso', 'evidência', 'descritor', 'avaliação', 'nota', 'IA']) {
      expect(bloco, `"${palavra}" não está na lista do que o fecho não pode citar`).toContain(`"${palavra}"`);
    }
  });

  /**
   * 🔴 Cota no schema vence prosa: foi assim que o PDI passou a inventar ponto
   * de atenção para entregar "2-3 áreas". Aqui o prompt E o schema dizem que
   * zero é resposta válida.
   */
  it('admite lista VAZIA de passos, em vez de exigir um número deles', () => {
    const { system, user } = promptEvolutionScenarioScore(PARAMS as any);
    expect(system).toContain('0 a 3 ações');
    expect(system).toMatch(/devolva \*\*lista vazia\*\*/);
    expect(user).toContain('lista VAZIA quando o material não sustentar nenhum');
    expect(system).not.toMatch(/exatamente (2|3|três) (ações|passos)/i);
  });

  it('o JSON pedido traz os dois campos novos dentro do resumo', () => {
    const { user } = promptEvolutionScenarioScore(PARAMS as any);
    expect(user).toContain('"mensagem_final"');
    expect(user).toContain('"proximos_passos"');
  });

  /** No piloto a janela não mede evolução: o fecho fala de ponto de partida. */
  it('na janela curta, o fecho não afirma evolução', () => {
    const curto = promptEvolutionScenarioScore({ ...PARAMS, notaPrograma: 'Degustação de 2 semanas.' } as any);
    expect(curto.system).toContain('o fecho NÃO afirma evolução');
    expect(promptEvolutionScenarioScore(PARAMS as any).system).not.toContain('NÃO afirma evolução');
  });
});

describe('validador do scorer', () => {
  it('guarda o fecho e corta a lista em três, sem item vazio', () => {
    const out = validateEvolutionScenarioScore({
      avaliacao_por_descritor: [],
      resumo_avaliacao: {
        mensagem_geral: 'devolutiva',
        mensagem_final: 'Você organizou o que já fazia por instinto.',
        proximos_passos: ['Marque o encontro', '  ', 'Registre os encaminhamentos', 'Peça apoio', 'Quarto passo'],
      },
    });
    expect(out.resumo_avaliacao.mensagem_final).toBe('Você organizou o que já fazia por instinto.');
    expect(out.resumo_avaliacao.proximos_passos).toEqual(['Marque o encontro', 'Registre os encaminhamentos', 'Peça apoio']);
  });

  it('resumo ausente ou em string não inventa fecho', () => {
    expect(validateEvolutionScenarioScore({ resumo_avaliacao: 'texto cru' }).resumo_avaliacao)
      .toMatchObject({ mensagem_final: '', proximos_passos: [] });
    expect(validateEvolutionScenarioScore({}).resumo_avaliacao)
      .toMatchObject({ mensagem_final: '', proximos_passos: [] });
  });

  it('normalizarPassos: o que não é lista vira lista vazia', () => {
    expect(normalizarPassos(undefined)).toEqual([]);
    expect(normalizarPassos('um passo')).toEqual([]);
    expect(normalizarPassos([' a ', 1, null, 'b'])).toEqual(['a', 'b']);
  });
});

describe('fechoDoRelatorio: as duas gerações', () => {
  const NOVO = {
    insight_geral: 'A colaboradora demonstra evolução na conversa.',
    proximo_passo: null,
    resumo_avaliacao: {
      mensagem_geral: 'devolutiva de abertura',
      mensagem_final: 'Você sai com rituais que a escola reconhece.',
      proximos_passos: ['Marque o encontro quinzenal', 'Registre os encaminhamentos'],
    },
  };
  const ANTIGO = {
    insight_geral: 'A colaboradora demonstra evolução concreta.',
    proximo_passo: 'Seguir acompanhando os encaminhamentos.',
    resumo_avaliacao: { mensagem_geral: 'devolutiva de abertura' },
  };

  it('relatório novo fecha com o texto escrito para a pessoa, não com a leitura do extrator', () => {
    const fecho = fechoDoRelatorio(NOVO);
    expect(fecho.mensagemFinal).toBe('Você sai com rituais que a escola reconhece.');
    expect(fecho.proximosPassos).toEqual(['Marque o encontro quinzenal', 'Registre os encaminhamentos']);
  });

  it('relatório antigo continua fechando com o que ele tem: nada foi regerado', () => {
    const fecho = fechoDoRelatorio(ANTIGO);
    expect(fecho.mensagemFinal).toBe('A colaboradora demonstra evolução concreta.');
    expect(fecho.proximosPassos).toEqual(['Seguir acompanhando os encaminhamentos.']);
  });

  it('sem fecho de nenhuma geração, não há seção: nulo e lista vazia', () => {
    expect(fechoDoRelatorio({ resumo_avaliacao: { mensagem_geral: 'só a devolutiva' } }))
      .toEqual({ mensagemFinal: null, proximosPassos: [] });
    expect(fechoDoRelatorio(null)).toEqual({ mensagemFinal: null, proximosPassos: [] });
    // 🔴 O caso de Ibipeba: `proximo_passo` null em 10 de 10. Lista vazia, e a
    // seção não aparece — nunca uma linha "null" no papel.
    expect(fechoDoRelatorio({ insight_geral: 'x', proximo_passo: null }).proximosPassos).toEqual([]);
  });

  it('a lista nova vence o passo antigo quando os dois existem', () => {
    const fecho = fechoDoRelatorio({ ...ANTIGO, resumo_avaliacao: NOVO.resumo_avaliacao });
    expect(fecho.proximosPassos).toEqual(['Marque o encontro quinzenal', 'Registre os encaminhamentos']);
    expect(fecho.mensagemFinal).toBe('Você sai com rituais que a escola reconhece.');
  });
});

describe('o fecho passa pelas travas que já existiam', () => {
  /**
   * As construções são as que o revisor conhece (sujeito explícito + verbo de
   * estado); o que este teste prova é que as CHAVES novas entram na revisão, não
   * que o revisor cubra qualquer frase.
   */
  it('revisão de gênero alcança a mensagem final e cada passo', () => {
    const r: any = resumoSemTratamentoDeGenero({
      mensagem_geral: 'm',
      mensagem_final: 'Você está sobrecarregada.',
      proximos_passos: ['Peça apoio: você vem carregando tudo sozinha.'],
      evidencias_citadas: ['ela disse que ficou sozinha'],
    });
    expect(r.mensagem_final).toBe('Você está com sobrecarga.');
    expect(r.proximos_passos[0]).toBe('Peça apoio: você vem carregando tudo por conta própria.');
    // citação literal não é reescrita
    expect(r.evidencias_citadas[0]).toBe('ela disse que ficou sozinha');
  });

  it('a trava do piloto corrige a duração no fecho e nos passos, e não só na devolutiva', () => {
    const { parsed, ok, alterou } = sanitizarNarrativaPiloto({
      resumo_avaliacao: {
        mensagem_geral: 'Ao final das 14 semanas, você mostrou preparo.',
        mensagem_final: 'Ao final das 14 semanas, você leva um jeito próprio de conduzir.',
        proximos_passos: ['Retome ao final das 14 semanas o combinado com a equipe'],
      },
    }, 2);
    expect(ok).toBe(true);
    expect(alterou).toBe(true);
    expect(parsed.resumo_avaliacao.mensagem_final).toContain('2 semanas');
    expect(parsed.resumo_avaliacao.mensagem_final).not.toContain('14 semanas');
    expect(parsed.resumo_avaliacao.proximos_passos[0]).not.toContain('14 semanas');
  });
});
