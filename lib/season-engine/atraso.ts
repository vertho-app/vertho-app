/**
 * "Esta pessoa está em dia ou atrasada?" — UMA régua, para todas as telas.
 *
 * A pergunta já era respondida em pedaços espalhados: a home calculava a semana
 * da pessoa inline (`concluidas + 1`), o `week-gating` sabia quando cada semana
 * LIBERA, e ninguém cruzava as duas. O resultado é que "38 em jornada ativa"
 * parecia saúde — `Medido em 25/08 no tenant macae`: das 38, **8 estão em dia e
 * 30 atrasadas**, todas na semana 2 do calendário sem ter concluído a 1.
 *
 * As duas metades vêm de onde já existiam:
 *  · a da PESSOA é a mesma de `lib/home/loaders.ts` — semana atual é a próxima
 *    depois das concluídas, limitada pelo total do plano DELA (jornada 7,
 *    onboarding 10, piloto 3 — nunca 14 cravado);
 *  · a do CALENDÁRIO é `semanaLiberadaEm`, que já decide o que a pessoa pode
 *    abrir (06:00 UTC do dia de início + 7 dias por semana).
 *
 * Escrever uma terceira régua aqui seria repetir o erro que esta base já pagou
 * caro: gate de tela e gate de mensagem discordando, cada tela com o seu número.
 */
import { semanaLiberadaEm } from './week-gating';

/** Em que semana a PESSOA está: a próxima depois das que ela concluiu. */
export function semanaDaPessoa(semanasConcluidas: number, totalSemanas: number): number {
  return Math.min(Math.max(1, totalSemanas), Math.max(0, semanasConcluidas) + 1);
}

/**
 * Em que semana o CALENDÁRIO está — a maior já liberada, limitada pelo plano.
 * Sem `dataInicio` não há calendário: devolve `null` (e ninguém é acusado).
 */
export function semanaDoCalendario(
  dataInicio: string | null | undefined,
  totalSemanas: number,
  agora: Date = new Date(),
): number | null {
  const primeira = semanaLiberadaEm(dataInicio, 1);
  if (!primeira) return null;
  const semanasPassadas = Math.floor((agora.getTime() - primeira.getTime()) / (7 * 24 * 3600 * 1000));
  return Math.min(Math.max(1, totalSemanas), Math.max(1, semanasPassadas + 1));
}

/**
 * `true` = o calendário passou da pessoa. `null` = não dá para dizer (trilha sem
 * data de início) — e "não sei" nunca vira "atrasada": acusar por falta de dado
 * é a mesma classe do `count` nulo virando "0 pessoas".
 */
export function estaAtrasada(args: {
  dataInicio: string | null | undefined;
  totalSemanas: number;
  semanasConcluidas: number;
  agora?: Date;
}): boolean | null {
  const cal = semanaDoCalendario(args.dataInicio, args.totalSemanas, args.agora);
  if (cal == null) return null;
  return semanaDaPessoa(args.semanasConcluidas, args.totalSemanas) < cal;
}
