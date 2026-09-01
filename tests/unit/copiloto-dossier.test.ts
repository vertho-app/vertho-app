import { describe, expect, it } from 'vitest';

import {
  inferConversationGoal,
  normalizeAccountSnapshot,
  normalizeConfidence,
  normalizeConversationGoal,
  normalizeFactHooks,
  normalizeObjectionRoutes,
  normalizeValueMath,
  sortQuestionsByGoal,
} from '@/lib/copiloto/dossier';
import type { DiscoveryKey } from '@/lib/copiloto/types';

describe('avanço da conversa', () => {
  it('aceita só as portas conhecidas', () => {
    expect(normalizeConversationGoal('confirmar_dor')).toBe('confirmar_dor');
    expect(normalizeConversationGoal('qualquer_coisa')).toBeNull();
    expect(normalizeConversationGoal(null)).toBeNull();
  });

  it('infere o avanço pelo estágio quando o vendedor não escolhe', () => {
    expect(inferConversationGoal({ stage: 'lead_identificado', hasConversation: false })).toBe('entender_momento');
    expect(inferConversationGoal({ stage: 'contato_iniciado', hasConversation: true })).toBe('confirmar_dor');
    expect(inferConversationGoal({ stage: 'diagnostico_reuniao_realizada' })).toBe('construir_valor');
    expect(inferConversationGoal({ stage: 'proposta_enviada' })).toBe('destravar_decisao');
    expect(inferConversationGoal({ stage: 'cliente_ativo' })).toBe('abrir_frente');
  });

  it('reordena o banco pelo avanço, sem descartar pergunta', () => {
    const questions: Array<{ discovery: DiscoveryKey | null; text: string }> = [
      { discovery: 'situacao_atual', text: 'situação' },
      { discovery: 'decisor', text: 'decisor' },
      { discovery: null, text: 'solta' },
      { discovery: 'prazo', text: 'prazo' },
    ];

    const ordenadas = sortQuestionsByGoal(questions, 'destravar_decisao');

    expect(ordenadas.map((item) => item.text)).toEqual(['decisor', 'prazo', 'situação', 'solta']);
    expect(ordenadas).toHaveLength(questions.length);
  });

  it('mantém a ordem original quando não há avanço escolhido', () => {
    const questions: Array<{ discovery: DiscoveryKey | null; text: string }> = [
      { discovery: 'prazo', text: 'a' },
      { discovery: 'decisor', text: 'b' },
    ];

    expect(sortQuestionsByGoal(questions, null).map((item) => item.text)).toEqual(['a', 'b']);
  });
});

describe('procedência da evidência', () => {
  it('rebaixa "confirmado" quando não há fonte', () => {
    expect(normalizeConfidence('confirmado', false)).toBe('inferencia');
    expect(normalizeConfidence('confirmado', true)).toBe('confirmado');
  });

  it('trata rótulo desconhecido como a confirmar', () => {
    expect(normalizeConfidence('quase_certo', true)).toBe('nao_confirmado');
    expect(normalizeConfidence(undefined, true)).toBe('nao_confirmado');
  });
});

describe('retrato da conta', () => {
  it('devolve null quando não há nenhum campo com conteúdo', () => {
    expect(normalizeAccountSnapshot({ porte: '', estrutura: '  ', evento_critico: '', base_do_momento: '' })).toBeNull();
    expect(normalizeAccountSnapshot(null)).toBeNull();
  });

  it('rebaixa a procedência de um retrato sem fonte', () => {
    const snapshot = normalizeAccountSnapshot({
      porte: '1.200 colaboradores em 14 unidades',
      estrutura: 'Grupo familiar, capital fechado',
      momento: 'expansao',
      base_do_momento: 'Três vagas de coordenação no trimestre.',
      evento_critico: 'Novo centro de distribuição no segundo semestre.',
      procedencia: 'confirmado',
      fonte_url: null,
    });

    expect(snapshot?.confidence).toBe('inferencia');
    expect(snapshot?.moment).toBe('expansao');
  });

  it('cai para momento indefinido quando a etiqueta não existe', () => {
    const snapshot = normalizeAccountSnapshot({ porte: '300 pessoas', momento: 'bombando' });
    expect(snapshot?.moment).toBe('indefinido');
  });
});

describe('ganchos', () => {
  const base = { implicacao: 'Gestor novo sem régua escrita.', pergunta: 'Como preparam quem assume?' };

  it('derruba o gancho que cita um fato inexistente', () => {
    const hooks = normalizeFactHooks([{ ...base, fact_index: 5 }, { ...base, fact_index: 0 }], 2);
    expect(hooks).toHaveLength(1);
    expect(hooks[0].factIndex).toBe(0);
  });

  it('exige implicação e pergunta: sem elas sobra o fato cru, que já existe', () => {
    expect(normalizeFactHooks([{ fact_index: 0, implicacao: 'x'.repeat(30) }], 2)).toHaveLength(0);
    expect(normalizeFactHooks([{ fact_index: 0, pergunta: 'E aí?' }], 2)).toHaveLength(0);
  });

  it('não repete o mesmo fato em dois ganchos', () => {
    expect(normalizeFactHooks([{ ...base, fact_index: 0 }, { ...base, fact_index: 0 }], 3)).toHaveLength(1);
  });
});

describe('rotas de objeção', () => {
  const rota = {
    sintoma: 'O RH já tem uma ferramenta.',
    cadeira: 'RH',
    causa: 'Confunde registro com desenvolvimento.',
    acolher: 'Faz sentido.',
    explorar: 'Depois que a avaliação fecha, o que acontece com o resultado?',
    evidencia: 'O PDI gerado do diagnóstico.',
    alternativa: 'Amostra com três cargos.',
    avancar: 'Leitura da amostra na quinta.',
  };

  it('preserva o fluxo inteiro, e não só a pergunta que abre', () => {
    const [normalizada] = normalizeObjectionRoutes([rota]);
    expect(normalizada.acknowledge).toBe('Faz sentido.');
    expect(normalizada.evidence).toBe('O PDI gerado do diagnóstico.');
    expect(normalizada.alternative).toBe('Amostra com três cargos.');
    expect(normalizada.advance).toBe('Leitura da amostra na quinta.');
  });

  it('aceita rota sem prova: saber que não temos vale mais que inventar uma', () => {
    const [semProva] = normalizeObjectionRoutes([{ ...rota, evidencia: '' }]);
    expect(semProva.evidence).toBe('');
    expect(semProva.explore).toBe(rota.explorar);
  });

  it('descarta rota sem a pergunta que explora', () => {
    expect(normalizeObjectionRoutes([{ ...rota, explorar: '' }])).toHaveLength(0);
  });

  it('não repete o mesmo sintoma', () => {
    expect(normalizeObjectionRoutes([rota, { ...rota, cadeira: 'financeiro' }])).toHaveLength(1);
  });
});

describe('aritmética do valor', () => {
  const formula = {
    nome: 'Custo do ciclo manual',
    formula: '(gestores) x (horas por ciclo) x (custo hora)',
    conhecidas: [{ variavel: 'ciclos por ano', valor: '2', procedencia: 'confirmado', fonte_url: 'https://empresa.example/rh' }],
    abertas: [{ variavel: 'gestores', pergunta: 'Quantos gestores entram no ciclo?', descoberta: 'decisor' }],
  };

  it('mantém a fórmula com variável aberta e a pergunta que a preenche', () => {
    const [normalizada] = normalizeValueMath([formula]);
    expect(normalizada.open[0].ask).toBe('Quantos gestores entram no ciclo?');
    expect(normalizada.open[0].discovery).toBe('decisor');
    expect(normalizada.known[0].confidence).toBe('confirmado');
  });

  it('descarta fórmula sem variável aberta: seria uma conta que o copiloto fez sozinho', () => {
    expect(normalizeValueMath([{ ...formula, abertas: [] }])).toHaveLength(0);
  });

  it('rebaixa variável conhecida sem fonte', () => {
    const [normalizada] = normalizeValueMath([{
      ...formula,
      conhecidas: [{ variavel: 'headcount', valor: '1200', procedencia: 'confirmado' }],
    }]);
    expect(normalizada.known[0].confidence).toBe('inferencia');
  });
});
