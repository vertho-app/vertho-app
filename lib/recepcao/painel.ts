/**
 * Visão da equipe do atendimento por competência (revisão de 18/09/2026, 4.1).
 * O painel agrupava por caso, versão e COBERTURA: duas conversas do mesmo caso
 * com 83% e 87% de cobertura viravam grupos diferentes, e não havia como ver
 * onde cada pessoa está nas cinco competências nem quem ainda não treinou.
 *
 * Mesma régua do vendas (`lib/simuladores/evolucao.ts`): maior nível alcançado
 * na competência (só avanço), só de relatórios na escala 1 a 4 com matriz.
 * Módulo puro: a agregação roda no servidor e a tela só desenha.
 */
import { RECEPCAO_SESSAO } from '@/lib/status';
import {
  distribuicaoPorCompetencia,
  evolucaoPorCompetencia,
  type EvolucaoCompetencia,
} from '@/lib/simuladores/evolucao';

export interface PessoaAtendimento {
  id: string;
  nome: string;
  cargo: string | null;
}
type Linha = {
  colaborador_id: string | null;
  created_at: string;
  estado: {
    status: string;
    relatorio?: {
      escalaNota?: string;
      competencias?: Array<{ codigo: string; nota: number | null }>;
    } | null;
  };
};

export function visaoPorCompetencia(rows: Linha[], populacao: PessoaAtendimento[], codigos: readonly string[]) {
  const pessoas = populacao.map((p) => {
    const minhas = rows
      .filter((r) => r.colaborador_id === p.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
    const concluidas = minhas.filter((r) => r.estado.status === RECEPCAO_SESSAO.CONCLUIDA);
    const comMatriz = concluidas
      .filter((r) => r.estado.relatorio?.escalaNota === '1-4' && r.estado.relatorio.competencias?.length)
      .map((r) => ({
        competencias: Object.fromEntries(r.estado.relatorio!.competencias!.map((c) => [c.codigo, c.nota])),
      }));
    return {
      ...p,
      iniciadas: minhas.length,
      concluidas: concluidas.length,
      ultimo: minhas[0]?.created_at ?? null,
      competencias: evolucaoPorCompetencia(comMatriz, codigos) as EvolucaoCompetencia[],
    };
  });
  pessoas.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    pessoas,
    competencias: distribuicaoPorCompetencia(pessoas, codigos),
    naoTreinaram: pessoas.filter((p) => p.iniciadas === 0).map(({ id, nome, cargo }) => ({ id, nome, cargo })),
  };
}
