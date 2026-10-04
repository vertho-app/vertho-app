import { primeiraSemanaDeConteudo, semanaLiberadaEm } from '@/lib/season-engine/week-gating';

/**
 * A trilha existe, mas a semana 1 ainda não abriu? Devolve o instante em que ela
 * abre; `null` quando já abriu (ou quando não há data para decidir).
 *
 * "A semana 1" é a primeira semana de CONTEÚDO do `plano` (`primeiraSemanaDeConteudo`):
 * no Onboarding a semana 1 é o Mapeamento, que nasce concluída com o calendário uma
 * semana atrás, e quem espera é a semana 2. Sem `plano` é a 1, como sempre.
 *
 * Existe porque a home oferecia "Iniciar atividade de hoje" assim que a trilha
 * nascia, e a trilha nasce com início na PRÓXIMA segunda: quem clicava na
 * quinta encontrava a semana 1 trancada por quatro dias (R-86, 03/10/2026). A
 * régua de liberação é a mesma do week-gating (`semanaLiberadaEm`), não uma cópia.
 */
export function inicioDaJornadaAindaFuturo(
  dataInicio: string | null | undefined,
  agora: Date = new Date(),
  plano?: any[] | null,
): Date | null {
  const libera = semanaLiberadaEm(dataInicio, primeiraSemanaDeConteudo(plano));
  if (!libera) return null;
  return agora.getTime() < libera.getTime() ? libera : null;
}

/** "segunda-feira, 06/10" no idioma da pessoa, no fuso de Brasília (o do calendário da trilha). */
export function formatarInicioDaJornada(quando: Date, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    weekday: 'long', day: '2-digit', month: '2-digit', timeZone: 'America/Sao_Paulo',
  }).format(quando);
}
