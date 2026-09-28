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

/**
 * O que o prazo permite AGORA, como a tela precisa saber. Até 27/09/2026 a
 * consulta devolvia só `podeTreinar`, e a tela desabilitava "Encerrar e receber
 * devolutiva" com ele: a tolerância de 24 h existia no servidor e ninguém
 * conseguia usá-la. `treina` = a pessoa treina (não só acompanha e tem a
 * permissão de responder); administrador da plataforma independe da janela.
 * `encerrarAte` só existe DENTRO da tolerância: é o que a tela avisa.
 */
export function acessoPeloPrazo(
  c: Prazo | null | undefined,
  o: { admin: boolean; treina: boolean },
  agora = Date.now(),
) {
  const vigente = o.admin || periodoVigente(c, agora);
  const encerra = o.admin || podeEncerrar(c, agora);
  return {
    vigente,
    podeTreinar: vigente && o.treina,
    podeEncerrar: encerra && o.treina,
    encerrarAte:
      !vigente && encerra && c?.periodo_fim
        ? new Date(Date.parse(c.periodo_fim) + TOLERANCIA_ENCERRAR_MS).toISOString()
        : null,
  };
}
