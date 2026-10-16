/**
 * PAUSA DE ENVIOS por empresa (pedido do dono, 16/10/2026, Amazon Bowling: "não envie os PDIs amanhã... precisamos
 * fechar todo o fluxo corretamente antes").
 *
 * Não havia como segurar uma empresa: o aviso de PDI pronto (cron `avisar_planos`, 9h) percorre todas as empresas que
 * não são demo, e a cadência diária (`trigger_diario`) atende toda empresa com envio no dia. A Amazon tinha 14 PDIs
 * novos (aviso no sábado) e 14 trilhas "ativas" com início na segunda, gerados enquanto o fluxo ainda tinha auditorias
 * reprovadas a refazer.
 *
 * `sys_config.envios_pausados = { motivo, desde, ate? }` (ou `true`). Sem `ate`, vale até alguém tirar a chave.
 * PAUSA: o aviso de PDI pronto (cron e o botão do painel do cliente), a cadência diária (o despacho e o worker) e o
 * preparo antecipado dela (cron `preparar_desafios`, que gera com IA as tarefas das semanas seguintes).
 * NÃO PAUSA: o envio manual explícito do admin (broadcast), que é decisão de quem clica.
 */
export interface PausaEnvios { motivo: string; desde?: string; ate?: string }

export function pausaDeEnvios(sysConfig: unknown, agoraISO: string = new Date().toISOString()): PausaEnvios | null {
  const p = (sysConfig as any)?.envios_pausados;
  if (p === true) return { motivo: 'pausa sem motivo registrado' };
  if (!p || typeof p !== 'object') return null;
  if (p.ate && String(p.ate) <= agoraISO) return null;
  return { motivo: String(p.motivo || 'pausa sem motivo registrado'), ...(p.desde ? { desde: String(p.desde) } : {}), ...(p.ate ? { ate: String(p.ate) } : {}) };
}
