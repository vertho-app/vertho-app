import { COMPETENCIAS_PACE, MATRIZ_VERSION } from '@/lib/simulador-vendas/matriz';
import type { AvaliacaoMatriz } from '@/lib/simulador-vendas/matriz-avaliacao';
import { estado, relatorio } from './simulador-vendas';
export const PLANO =
  'Vou confirmar os impactos do estoque, priorizar necessidades e comparar opções de implantação.';
export const FALA = 'Como vocês administram o estoque hoje? Qual impacto isso tem para a equipe?';
export function estadoMatriz() {
  return {
    ...estado(),
    versaoRegua: 'pace-4',
    planejamento: PLANO,
    mensagens: [
      {
        id: 'v1',
        turno: 1,
        autor: 'vendedor' as const,
        texto: FALA,
        fase: 'preparar' as const,
      },
    ],
  };
}
/** Fixture estrutural; a qualidade semântica é conferida na sonda de IA com uma conversa completa. */
export function avaliacaoMatriz(nivel: 1 | 2 | 3 | 4 = 3): AvaliacaoMatriz {
  return {
    versao: MATRIZ_VERSION,
    descritores: COMPETENCIAS_PACE.flatMap((c) =>
      c.descritores.map((d) => ({
        codigo: d.codigo,
        nivel: ['E5', 'E6'].includes(d.codigo) ? null : nivel,
        justificativa: ['E5', 'E6'].includes(d.codigo)
          ? 'A simulação não inclui execução de pós-venda.'
          : 'Evidência estrutural para teste do contrato.',
        evidencias: ['E5', 'E6'].includes(d.codigo)
          ? []
          : [
              {
                origem: c.codigo === 'PL' ? ('planejamento' as const) : ('conversa' as const),
                turno: c.codigo === 'PL' ? null : 1,
                citacao: c.codigo === 'PL' ? PLANO : FALA,
              },
            ],
      })),
    ),
  };
}
export function relatorioMatriz() {
  return { ...structuredClone(relatorio), Matriz: avaliacaoMatriz() };
}
export function estadoDocumental() {
  return { ...estadoMatriz(), versaoRegua: 'pace-5' };
}
export function relatorioDocumental() {
  return {
    ...relatorioMatriz(),
    Recomendacoes: [
      {
        titulo: 'Confirme o diagnóstico',
        descricao: 'Retome com o cliente as prioridades antes de propor.',
        prioritaria: true,
        descritor: 'A6',
        referencia_manual: 'analisar' as const,
      },
      {
        titulo: 'Defina o avanço',
        descricao: 'Prepare um objetivo de reunião e uma alternativa de continuidade.',
        prioritaria: false,
        descritor: 'PL2',
        referencia_manual: 'planejamento' as const,
      },
      {
        titulo: 'Combine próximos passos',
        descricao: 'Confirme ação, responsável e prazo com o cliente.',
        prioritaria: false,
        descritor: 'E3',
        referencia_manual: 'engajar' as const,
      },
    ],
  };
}
