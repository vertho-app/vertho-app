/**
 * Idempotência POR CANAL da pílula diária.
 *
 * Vive em `lib/` (não em `actions/cron-jobs.ts`) porque num arquivo `'use server'`
 * todo export vira endpoint HTTP — helper puro não pode morar lá.
 *
 * Contexto: `triggerDiario` carimbava `ultima_pilulaN_em` incondicionalmente, fora
 * do try/catch. Numa queda do provedor de WhatsApp o banco afirmava "pílula
 * enviada" sem nada ter saído, e o carimbo então BLOQUEAVA o reenvio. Agora cada
 * canal carimba só o próprio sucesso, e a pendência é avaliada por canal.
 */

/** O carimbo é de hoje (UTC)? `null`/vazio = nunca carimbado = não é de hoje. */
export function mesmoDiaUTC(ts: string | null | undefined, hojeUTC: string): boolean {
  return !!ts && new Date(ts).toISOString().slice(0, 10) === hojeUTC;
}

/**
 * Um canal está pendente quando é APLICÁVEL (o colaborador tem esse contato) e
 * ainda não foi carimbado hoje. Canal inaplicável nunca pende — senão um colab
 * sem telefone manteria a pílula eternamente "em aberto".
 */
export function canalPendente(aplicavel: boolean, carimbo: string | null | undefined, hojeUTC: string): boolean {
  return aplicavel && !mesmoDiaUTC(carimbo, hojeUTC);
}

/**
 * A pílula precisa rodar hoje? Sim se QUALQUER canal aplicável ainda não saiu.
 *
 * Olhar só `ultima_pilulaN_em` seria o bug de novo: com o e-mail entregue e o
 * WhatsApp falho, aquele carimbo já existe e fecharia a porta exatamente para a
 * recuperação do canal que faltou.
 */
export function pilulaPendente(args: {
  temTelefone: boolean;
  temEmail: boolean;
  /** tem inscrição de push ativa (endpoint habilitado) */
  temPush?: boolean;
  carimboWhatsapp: string | null | undefined;
  carimboEmail: string | null | undefined;
  carimboPush?: string | null | undefined;
  hojeUTC: string;
}): boolean {
  return (
    canalPendente(args.temTelefone, args.carimboWhatsapp, args.hojeUTC) ||
    canalPendente(args.temEmail, args.carimboEmail, args.hojeUTC) ||
    // Push entra como canal de PRIMEIRA classe, não como penduricalho: se ele
    // falhou e os outros dois saíram, a pílula segue pendente e o push é
    // recuperável na próxima passada. Tratá-lo como secundário reintroduziria,
    // só que para o canal novo, exatamente o bug que este módulo consertou.
    canalPendente(Boolean(args.temPush), args.carimboPush, args.hojeUTC)
  );
}
