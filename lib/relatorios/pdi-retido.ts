/**
 * PDI que a 2ª IA REPROVOU não chega à pessoa (R-60, 03/10/2026).
 *
 * Até então o veredito da auditoria (`conteudo.auditoria.status`) ficava só no
 * admin: a pessoa lia o plano reprovado em /dashboard/pdi, baixava o PDF e ainda
 * recebia o WhatsApp "seu plano ficou pronto". Agora, reprovado, ele fica retido
 * ("em preparação", como antes de existir) até ser regerado e aprovado.
 *
 * ⚠️ Só vale para PDI gerado a partir do corte. Medido em 03/10/2026: 47 PDIs de
 * Macaé estão com veredito `fail` e TODOS já foram anunciados e lidos (a maioria
 * do auditor anterior a 25/09, que reprovava por ruído de uma rodada). Esconder
 * de repente um plano que a pessoa já usa é decisão do dono, não deste código:
 * está no relatório do lote 8. O aviso por WhatsApp segue a regra sem corte
 * (`decidirAvisos`): reprovado nunca é anunciado.
 */
export const CORTE_RETENCAO_PDI_REPROVADO = '2026-10-03T03:00:00.000Z';

export function pdiRetidoPelaAuditoria(conteudo: unknown, geradoEm: string | null | undefined): boolean {
  const c = typeof conteudo === 'string' ? (() => { try { return JSON.parse(conteudo); } catch { return null; } })() : conteudo;
  const status = (c as any)?.auditoria?.status;
  return status === 'fail' && !!geradoEm && String(geradoEm) >= CORTE_RETENCAO_PDI_REPROVADO;
}
