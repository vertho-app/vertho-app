import { nivelDaNota } from '@/lib/nivel-regua';
import { COMPETENCIAS_ATENDIMENTO, MATRIZ_ATENDIMENTO_VERSION } from './matriz';
import type { Cenario } from './schema';
import type { Estado } from './model';

/** Nova publicação; não modifica o snapshot de nenhuma sessão anterior. */
export function aplicarMatrizAtendimento(original: Cenario): Cenario {
  const c = structuredClone(original);
  c.matriz = {
    versao: MATRIZ_ATENDIMENTO_VERSION,
    competencias: structuredClone(COMPETENCIAS_ATENDIMENTO),
  };
  c.rubrica = COMPETENCIAS_ATENDIMENTO.map((comp) => {
    const criterios = original.rubrica
      .filter(
        (r) =>
          r.id === comp.codigo ||
          (comp.codigo === 'acolhimento' && r.id === 'conducao_conflito'),
      )
      .map((r) => r.criterio);
    return {
      id: comp.codigo,
      nome: comp.nome,
      peso: 20,
      criterio: criterios.join(' ') || comp.descricao,
      niveis: {
        n1: 'Conduta com lacunas nos descritores observáveis.',
        n2: 'Conduta em desenvolvimento nos descritores observáveis.',
        n3: 'Atende à meta descrita nos comportamentos observáveis.',
        n4: 'Demonstra os comportamentos de referência dos descritores observáveis.',
      },
    };
  });
  return c;
}

export function rubricaAvaliavel(c: Cenario): Cenario['rubrica'] {
  if (!c.matriz) return c.rubrica;
  return c.matriz.competencias.flatMap((comp) =>
    comp.descritores.map((d) => ({
      id: d.codigo,
      nome: d.nome,
      peso: 20 / 6,
      niveis: d.niveis,
      criterio: `${comp.nome}: ${c.rubrica.find((r) => r.id === comp.codigo)!.criterio} Comportamento: ${d.descricao}`,
    })),
  );
}

export function consolidarCompetenciasAtendimento(
  c: Cenario,
  dimensoes: NonNullable<Estado['relatorio']>['dimensoes'],
) {
  return c.matriz!.competencias.map((comp) => {
    const descritores = comp.descritores.map(
      (d) => dimensoes.find((r) => r.id === d.codigo)!,
    );
    const observados = descritores.filter(
      (d) => d.classificacao !== 'nao_observavel',
    );
    const nota = observados.length
      ? observados.reduce((s, d) => s + Number(d.classificacao.slice(1)), 0) /
        observados.length
      : null;
    return {
      codigo: comp.codigo,
      nome: comp.nome,
      nota,
      nivel: nota === null ? null : nivelDaNota(nota),
      observados: observados.length,
      total: 6,
      descritores: descritores.map((d) => d.id),
    };
  });
}

/** Histórico conserva o resultado original; a apresentação identifica a conversão de escala. */
export function notaAtendimento(
  rel: { nota: number | null; escalaNota?: string } | null | undefined,
): number | null {
  if (rel?.nota == null) return null;
  return rel.escalaNota === '1-4' ? rel.nota : 1 + (3 * rel.nota) / 100;
}

export function relatorioAtendimentoPublico(
  rel: Estado['relatorio'],
): Estado['relatorio'] {
  if (!rel || rel.escalaNota === '1-4') return rel;
  return {
    ...structuredClone(rel),
    nota: notaAtendimento(rel),
    escalaNota: '1-4',
    escalaOriginal: '0-100',
  };
}
