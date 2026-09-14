export type Prazo = { periodo_inicio?: string | null; periodo_fim?: string | null };
/** Início inclusivo, fim exclusivo. Sem datas = não contratado; não é acesso ilimitado no tempo. */
export function periodoVigente(c: Prazo | null | undefined, agora = Date.now()): boolean {
  return (
    !!c?.periodo_inicio &&
    !!c?.periodo_fim &&
    Date.parse(c.periodo_inicio) <= agora &&
    agora < Date.parse(c.periodo_fim)
  );
}
