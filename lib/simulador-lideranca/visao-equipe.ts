/**
 * O que o acompanhamento (RH e gestor) enxerga de um encontro do Simulador de
 * liderança. Núcleo puro: o servidor (`equipe.ts`) e o verificador de tela
 * usam a MESMA projeção.
 *
 * 🔑 Decisão do dono (D1, 27/09/2026): a tela promete que "a preparação e a
 * reflexão ficam com você". Até então a devolutiva ia inteira para a equipe, e
 * o trecho literal da preparação (fonte do descritor de preparação e propósito
 * da conversa) e o da reflexão (fonte de Autoconsciência) apareciam entre
 * aspas para o gestor. Agora, quando a fonte é a preparação ou a reflexão, a
 * evidência sai SEM o texto: fica a fonte e o nível do comportamento. A
 * justificativa desse comportamento também fica de fora, porque é escrita a
 * partir do mesmo texto e costuma parafraseá-lo. Trechos da CONVERSA seguem
 * citados. A pessoa continua vendo tudo na própria devolutiva.
 */
import type { AvaliacaoGravada, Episodio } from './schema';

export type FonteEvidencia = 'fala' | 'planejamento' | 'reflexao';

/** Fontes cujo texto fica com a pessoa. */
export const FONTES_RESERVADAS: readonly FonteEvidencia[] = ['planejamento', 'reflexao'];
export const fonteReservada = (fonte: FonteEvidencia) => FONTES_RESERVADAS.includes(fonte);

/** Evidência como a equipe recebe: sem `trecho` quando a fonte é reservada. */
export type EvidenciaEquipe = { fonte: FonteEvidencia; turno: number; trecho?: string };
export type DescritorEquipe = Omit<AvaliacaoGravada['descritores'][number], 'evidencias' | 'justificativa'> & {
  justificativa: string | null;
  evidencias: EvidenciaEquipe[];
};
export type AvaliacaoEquipe = Omit<AvaliacaoGravada, 'descritores'> & { descritores: DescritorEquipe[] };

export function avaliacaoParaEquipe(a: AvaliacaoGravada): AvaliacaoEquipe {
  return {
    ...a,
    descritores: a.descritores.map((d) => {
      const reservada = d.evidencias.some((e) => fonteReservada(e.fonte));
      return {
        ...d,
        justificativa: reservada ? null : d.justificativa,
        evidencias: d.evidencias.map((e) =>
          fonteReservada(e.fonte) ? { fonte: e.fonte, turno: e.turno } : { fonte: e.fonte, turno: e.turno, trecho: e.trecho },
        ),
      };
    }),
  };
}

/** Devolutiva do encontro, sem conversa, preparação ou reflexão. */
export function encontroParaEquipe(e: Episodio) {
  return {
    id: e.id,
    indice: e.indice,
    repeticao: e.repeticao,
    encerradoEm: e.encerradoEm,
    avaliacao: e.avaliacao ? avaliacaoParaEquipe(e.avaliacao) : null,
    // Acordos pela descrição: o trecho literal é fala da pessoa, e a conversa não sai daqui.
    consequencia: e.consequencia
      ? {
          narrativa: e.consequencia.narrativa,
          acordos: e.consequencia.acordos.map((a) => a.descricao),
          pendencias: e.consequencia.pendencias,
        }
      : null,
  };
}
export type EncontroEquipe = ReturnType<typeof encontroParaEquipe>;
