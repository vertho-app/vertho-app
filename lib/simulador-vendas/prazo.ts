export type Prazo = { periodo_inicio?: string | null; periodo_fim?: string | null };
/** Início inclusivo, fim exclusivo. Sem datas = não contratado; não é acesso ilimitado no tempo. */
/**
 * Quem estava no meio de uma conversa quando o prazo venceu ainda pode pedir a
 * devolutiva por 24 horas. Até 18/09 o treino ficava aberto e sem relatório: o
 * prazo bloqueava também o encerramento.
 */
export const TOLERANCIA_ENCERRAR_MS = 24 * 60 * 60 * 1000;
export function podeEncerrar(c: Prazo | null | undefined, agora = Date.now()): boolean {
  return (
    periodoVigente(c, agora) ||
    (!!c?.periodo_inicio &&
      !!c?.periodo_fim &&
      Date.parse(c.periodo_inicio) <= agora &&
      agora < Date.parse(c.periodo_fim) + TOLERANCIA_ENCERRAR_MS)
  );
}
export function periodoVigente(c: Prazo | null | undefined, agora = Date.now()): boolean {
  return (
    !!c?.periodo_inicio &&
    !!c?.periodo_fim &&
    Date.parse(c.periodo_inicio) <= agora &&
    agora < Date.parse(c.periodo_fim)
  );
}
