import { ETAPAS, type Estado, type Saidas } from '@/lib/simulador-vendas/schema';
export const cenario: Saidas['criador'] = {
  contexto_vendedor: 'Beatriz é diretora de operações da Horizonte, em Curitiba.', contexto_gerente: 'GABARITO_RESERVADO',
  personagem: { nome: 'Beatriz', cargo: 'Diretora', empresa: 'Horizonte', cidade: 'Curitiba', personalidade_pace: 'Conforme',
    traco_dominante: 'Analítica', tom_linguagem: 'Objetivo', historia: 'Reservada',
    personalidade_nivel: { nivel: 'Junior', descricao: '', nota_corte_objecao: 0.5, nota_corte_preco: 0.5, cenarios_validos: [], regra_avaliacao: '' },
    negociacao: { nome_vendedor: 'Ana', objecoes: [{ descricao: 'Prazo', minimo_aceitavel: '30 dias', ideal: '10 dias' }], objecoes_profundas: [],
      beneficios_ocultos: [{ nome: 'Previsibilidade', categoria: 'Operação', prova_esperada: '', gatilho_descoberta: '', peso: 0.3 }],
      preco: { minimo_aceitavel: 'PRECO_SECRETO', ideal: 'R$ 2.000,00/mês' }, notas_cortes: { negociacao_objecoes: 0.5, negociacao_preco: 0.5 } } },
};
export const relatorio: Saidas['gerente'] = { P: 7, A: 6, C: 5, E: 4, Media: 10,
  Preparacao: 'Criou contexto.', Analise: 'Diagnosticou a operação.', Cocriacao: 'Apresentou condições.', Engajamento: 'Definiu próximos passos.', Resumo: 'Avance no diagnóstico antes de propor.',
  Recomendacoes: [{ titulo: 'Aprofunde', descricao: 'Pergunte sobre o impacto do prazo.', prioritaria: true }],
  Resultado: 'inconclusivo', Preco_final: '', Compromissos_obtidos: '', Beneficios_ocultos_descobertos: [], Objecoes_profundas_descobertas: [], Violacoes: [] };
export const semViolacao: Saidas['moderador'] = { violacao: false, categoria: null, severidade: null, acao_sugerida: null, confianca: null, motivo: null };
export function estado(): Estado {
  return { id: '10000000-0000-4000-8000-000000000001', revisao: 1, status: 'em_andamento', nivel: 1, nomeVendedor: 'Ana',
    briefing: 'BRIEFING_PRIVADO', prompts: Object.fromEntries(ETAPAS.map(e => [e, { texto: 'PROMPT_PRIVADO', hash: 'cde43cbbeb7a2ebd1a5e66a0476b3d9961273013285909ed7bba8ad9eced3a82', versao: '1', modelo: 'gpt-5.4-2026-03-05' }])) as Estado['prompts'],
    cenario: structuredClone(cenario), fase: 'preparar', mensagens: [], moderacoes: [], intencao: null, relatorio: null, feedback: null,
    criadoEm: '2026-09-13T12:00:00.000Z', encerradoEm: null, recibos: [] };
}
