/**
 * Evolução por competência, só com AVANÇO, comum aos simuladores (18/09/2026).
 * Nasceu no vendas (evolução do participante e visão da equipe) e passou a
 * servir o atendimento: a mesma régua nos dois painéis.
 *
 * Regra do produto para evolução: mostra o MAIOR nível alcançado e se ele passou
 * do primeiro nível registrado. Um treino pior depois de um melhor não aparece
 * como queda: cada simulação tem outra pessoa simulada e outra dificuldade.
 * `treinos` chega do mais recente para o mais antigo (ordem dos históricos).
 */
import { nivelDaNota, type Nivel } from '@/lib/nivel-regua';

export interface EvolucaoCompetencia<C extends string = string> {
  codigo: C;
  /** Maior nível alcançado nos treinos considerados. */
  nivelAlcancado: Nivel | null;
  primeiroNivel: Nivel | null;
  subiu: boolean;
  /** Treinos em que a competência teve nível. */
  treinos: number;
}

export type NotasDeTreino<C extends string = string> = { competencias?: Partial<Record<C, number | null>> | null };

export function evolucaoPorCompetencia<C extends string>(
  treinos: ReadonlyArray<NotasDeTreino<C>>,
  codigos: readonly C[],
): EvolucaoCompetencia<C>[] {
  const cronologica = [...treinos].reverse();
  return codigos.map((codigo) => {
    const niveis = cronologica
      .map((t) => t.competencias?.[codigo])
      .filter((n): n is number => typeof n === 'number')
      .map((n) => nivelDaNota(n));
    const primeiroNivel = niveis[0] ?? null;
    const nivelAlcancado = niveis.length ? (Math.max(...niveis) as Nivel) : null;
    return {
      codigo,
      nivelAlcancado,
      primeiroNivel,
      subiu: primeiroNivel !== null && nivelAlcancado !== null && nivelAlcancado > primeiroNivel,
      treinos: niveis.length,
    };
  });
}

/** Quantas pessoas chegaram a cada nível, contando o melhor treino de cada uma. */
export function distribuicaoPorCompetencia<C extends string>(
  pessoas: ReadonlyArray<{ competencias: EvolucaoCompetencia<C>[] }>,
  codigos: readonly C[],
) {
  const comNivel = pessoas.filter((p) => p.competencias.some((c) => c.nivelAlcancado !== null));
  return codigos.map((codigo) => {
    const niveis: [number, number, number, number] = [0, 0, 0, 0];
    let semNivel = 0;
    for (const p of comNivel) {
      const n = p.competencias.find((c) => c.codigo === codigo)?.nivelAlcancado ?? null;
      if (n === null) semNivel++;
      else niveis[n - 1]++;
    }
    return { codigo, niveis, semNivel };
  });
}
