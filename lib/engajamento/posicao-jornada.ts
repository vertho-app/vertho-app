import { primeiraSemanaAcessivel } from '@/lib/season-engine/week-gating';
import { PROGRESSO } from '@/lib/status';

export interface PosicaoJornada {
  /** Semana que a pessoa realmente consegue abrir, respeitando a progressão sequencial. */
  semanaAcessivel: number | null;
  /** Há pelo menos uma etapa anterior ao relógio da cadência ainda pendente. */
  atrasada: boolean;
  /** A própria semana acessível já foi concluída (pessoa em dia aguardando a próxima). */
  semanaConcluida: boolean;
}

/**
 * Traduz o relógio da cadência em posição INDIVIDUAL da jornada.
 *
 * `fase4_envios.semana_atual` anda pelo calendário e, sozinho, não prova que a
 * pessoa concluiu as semanas anteriores. A posição exibida nos painéis precisa
 * usar a mesma régua sequencial que decide qual link a cadência pode entregar.
 *
 * Quando as leituras de trilha/progresso não são confiáveis, devolve `null` em
 * vez de cair no calendário e transformar falha de banco em avanço inventado.
 */
export function derivarPosicaoJornada(input: {
  semanaCalendario: number | string;
  dataInicio: string | null | undefined;
  plano: any[] | null | undefined;
  progresso: any[] | Record<string | number, any> | null | undefined;
  confiavel: boolean;
  now?: Date;
}): PosicaoJornada {
  if (!input.confiavel) {
    return { semanaAcessivel: null, atrasada: false, semanaConcluida: false };
  }

  const semanaCalendarioBruta = Number(input.semanaCalendario);
  const semanaCalendario = Number.isFinite(semanaCalendarioBruta) && semanaCalendarioBruta > 0
    ? Math.floor(semanaCalendarioBruta)
    : 1;
  const semanaAcessivel = primeiraSemanaAcessivel({
    dataInicio: input.dataInicio,
    plano: input.plano,
    progresso: input.progresso,
    semana: semanaCalendario,
    now: input.now,
  });
  const progressos = Array.isArray(input.progresso)
    ? input.progresso
    : Object.values(input.progresso || {});
  const semanaConcluida = progressos.some((p: any) => (
    Number(p?.semana) === semanaAcessivel && p?.status === PROGRESSO.CONCLUIDO
  ));

  return {
    semanaAcessivel,
    atrasada: semanaAcessivel < semanaCalendario,
    semanaConcluida,
  };
}
