/**
 * O que o acompanhamento (RH e gestor) enxerga da devolutiva de um treino do
 * Simulador de vendas. Núcleo puro: o servidor (`equipe.ts`) projeta antes de
 * responder, e a tela só desenha o que chegou.
 *
 * 🔑 Decisão do dono (decisão 5 da revisão de 02/10/2026, R-42), a mesma da
 * liderança (`lib/simulador-lideranca/visao-equipe.ts`): a preparação fica com
 * a pessoa. Até aqui a equipe recebia as citações literais do PLANO (evidência
 * com `origem: 'planejamento'`) e as justificativas escritas a partir dele.
 * Agora, quando a fonte é o planejamento, a evidência sai SEM o texto: fica a
 * fonte, o turno e o nível do comportamento. A justificativa desse
 * comportamento também fica de fora, porque é escrita a partir do mesmo texto
 * e costuma parafraseá-lo. Trechos da CONVERSA seguem citados. A pessoa
 * continua vendo tudo na própria devolutiva.
 */
import type { Saidas } from './schema';

type Relatorio = NonNullable<Saidas['gerente']>;
type Descritor = NonNullable<Relatorio['Matriz']>['descritores'][number];
type Evidencia = Descritor['evidencias'][number];

/** Fontes cujo texto fica com a pessoa. */
export const ORIGENS_RESERVADAS: readonly Evidencia['origem'][] = ['planejamento'];
export const origemReservada = (origem: Evidencia['origem']) => ORIGENS_RESERVADAS.includes(origem);

/** Evidência como a equipe recebe: sem `citacao` quando a origem é reservada. */
export type EvidenciaEquipe = Omit<Evidencia, 'citacao'> & { citacao?: string };
export type DescritorEquipe = Omit<Descritor, 'evidencias' | 'justificativa'> & {
  justificativa: string | null;
  evidencias: EvidenciaEquipe[];
};

export function descritorParaEquipe(d: Descritor): DescritorEquipe {
  const reservada = d.evidencias.some((e) => origemReservada(e.origem));
  return {
    ...d,
    justificativa: reservada ? null : d.justificativa,
    evidencias: d.evidencias.map((e) =>
      origemReservada(e.origem) ? { origem: e.origem, turno: e.turno } : { origem: e.origem, turno: e.turno, citacao: e.citacao },
    ),
  };
}

/**
 * A devolutiva como a equipe recebe. Relatório sem matriz (anterior à pace-4)
 * não tem citação de plano e passa como está.
 */
export function relatorioParaEquipe<R extends Relatorio | null>(r: R): R {
  if (!r?.Matriz) return r;
  return {
    ...r,
    Matriz: { ...r.Matriz, descritores: r.Matriz.descritores.map(descritorParaEquipe) },
  } as unknown as R;
}
