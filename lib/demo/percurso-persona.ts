import type { DemoRoster } from '@/lib/demo/rosters/types';
import { PROGRESSO } from '@/lib/status';

/**
 * Constrói o estado demonstrativo da persona navegável em relação a um único
 * relógio. O reset e a atualização incremental usam esta mesma função para não
 * recolocar a pessoa na semana 1 depois que a base é sincronizada.
 */
export function construirPercursoDaPersona(
  percurso: NonNullable<DemoRoster['percursoDaPersona']>,
  agora = new Date(),
): any[] {
  const linhas: any[] = [];
  const emCurso = percurso.emAndamento ?? 0;
  const diaEm = (semanasAtras: number) =>
    new Date(agora.getTime() - semanasAtras * 7 * 24 * 60 * 60 * 1000).toISOString();

  for (let semana = 1; semana <= percurso.concluidas; semana++) {
    const atras = (emCurso > 0 ? emCurso : percurso.concluidas + 1) - semana;
    const concluidoEm = diaEm(atras);
    const congelada = percurso.evidencias?.find((e) => e.semana === semana)?.reflexao;
    const reflexao = congelada
      ? {
          ...congelada,
          transcript_completo: (congelada.transcript_completo || [])
            .map((m: any) => ({ ...m, timestamp: concluidoEm })),
        }
      : null;
    linhas.push({
      semana,
      tipo: 'conteudo',
      status: PROGRESSO.CONCLUIDO,
      conteudo_consumido: true,
      iniciado_em: diaEm(atras + 1),
      concluido_em: concluidoEm,
      reflexao,
      feedback: null,
    });
  }
  if (emCurso > percurso.concluidas) {
    linhas.push({
      semana: emCurso,
      tipo: 'conteudo',
      status: PROGRESSO.EM_ANDAMENTO,
      conteudo_consumido: false,
      iniciado_em: diaEm(0),
      concluido_em: null,
      reflexao: null,
      feedback: null,
    });
  }
  return linhas;
}
